import type { APIRoute } from "astro";
import {
  getSessionFromDb,
  upsertSession,
  type SessionResultRow,
} from "../../../utils/f1/db";
import {
  getOpenF1SessionResults,
  getJolpicaQualifying,
  getJolpicaRaceResults,
  getJolpicaSprintResults,
} from "../../../utils/f1/api";
import { PRACTICE_SESSION_NAMES } from "../../../utils/f1/constants";
import type { SessionType } from "../../../utils/f1/types";

const OPENF1_SESSIONS = new Set(["fp1", "fp2", "fp3", "sprint_qualifying"]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function isRetryReady(row: SessionResultRow): boolean {
  const backoffMs = Math.min(
    5 * 60 * 1000 * Math.pow(2, row.retry_count),
    60 * 60 * 1000
  );
  const lastAttempt = new Date(row.last_attempted_at).getTime();
  return Date.now() - lastAttempt >= backoffMs;
}

function isSessionOver(
  race: { date: string; time: string | null } | null,
  sessionType: string
): boolean {
  if (!race) return false;
  const GRACE_MS = 30 * 60 * 1000;
  const DURATION_MS: Record<string, number> = {
    fp1: 60 * 60 * 1000,
    fp2: 60 * 60 * 1000,
    fp3: 60 * 60 * 1000,
    qualifying: 75 * 60 * 1000,
    sprint_qualifying: 45 * 60 * 1000,
    sprint: 30 * 60 * 1000,
    race: 120 * 60 * 1000,
  };
  const start = new Date(
    `${race.date}T${race.time ?? "00:00:00"}`
  ).getTime();
  const estimatedEnd = start + (DURATION_MS[sessionType] ?? 120 * 60 * 1000);
  return Date.now() > estimatedEnd + GRACE_MS;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const season = parseInt(url.searchParams.get("season") ?? "");
  const round = parseInt(url.searchParams.get("round") ?? "");
  const sessionType = url.searchParams.get("type") as SessionType | null;
  const country = url.searchParams.get("country") ?? "";
  const sessionDate = url.searchParams.get("date") ?? "";

  if (isNaN(season) || isNaN(round) || !sessionType) {
    return err("season, round, type params required");
  }

  const runtime = locals.runtime as { env: Env };
  const db = runtime.env.DB;

  const cached = await getSessionFromDb(db, season, round, sessionType);

  if (cached) {
    if (cached.status === "complete") {
      return json({
        status: "complete",
        results: JSON.parse(cached.results_json!),
      });
    }

    if (cached.status === "live") {
      if (!isSessionOver({ date: sessionDate, time: null }, sessionType)) {
        return json({ status: "live", results: null });
      }
    }

    if (cached.status === "pending") {
      if (!isRetryReady(cached)) {
        return json({
          status: "pending",
          results: cached.results_json
            ? JSON.parse(cached.results_json)
            : null,
        });
      }
    }
  }

  const source = OPENF1_SESSIONS.has(sessionType) ? "openf1" : "jolpica";

  try {
    let results: any[] | null = null;
    let openf1SessionKey: number | null =
      cached?.openf1_session_key ?? null;

    if (source === "openf1") {
      const practiceNum =
        sessionType === "fp1" ? 1 : sessionType === "fp2" ? 2 : sessionType === "fp3" ? 3 : null;
      const sessionName =
        practiceNum != null
          ? PRACTICE_SESSION_NAMES[practiceNum]
          : "Sprint Qualifying";

      const rows = await getOpenF1SessionResults(
        season,
        country,
        sessionName,
        sessionDate,
        sessionType === "sprint_qualifying"
      );
      results = rows.length ? rows : null;

    } else {
      if (sessionType === "qualifying") {
        results = await getJolpicaQualifying(String(season), String(round));
      } else if (sessionType === "sprint") {
        results = await getJolpicaSprintResults(String(season), String(round));
      } else if (sessionType === "race") {
        results = await getJolpicaRaceResults(String(season), String(round));
      }
    }

    const over = isSessionOver({ date: sessionDate, time: null }, sessionType);
    const status =
      results && results.length > 0
        ? over
          ? "complete"
          : "pending"
        : "pending";

    await upsertSession(
      db,
      season,
      round,
      sessionType,
      source,
      status,
      results,
      openf1SessionKey
    );

    return json({ status, results });

  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes("Live F1 session")) {
      await upsertSession(
        db,
        season,
        round,
        sessionType,
        source,
        "live",
        null
      );
      return json({ status: "live", results: null });
    }
    return err("Upstream fetch failed", 502);
  }
};
