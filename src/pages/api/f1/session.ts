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
import { getTeamIdFromName } from "../../../utils/f1/formatters";
import type { OpenF1Driver, OpenF1ResultRow } from "../../../utils/f1/types";
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

async function getQualifyingPracticeOrder(
  db: D1Database,
  season: number,
  round: number,
  country: string,
  sessionDate: string,
  missingNumbers: Set<string>,
  isSprintQualifying = false,
): Promise<Map<string, number> | null> {
  // FIA B2.4.3 uses the last lap-time-classified session in which every
  // unclassified driver participated. On sprint weekends this can be SQ;
  // otherwise search FP3, FP2, then FP1.
  const candidates = (isSprintQualifying ? [
    ["fp1", "Practice 1"],
  ] : [
    ["sprint_qualifying", "Sprint Qualifying"],
    ["fp3", "Practice 3"],
    ["fp2", "Practice 2"],
    ["fp1", "Practice 1"],
  ]) as ReadonlyArray<readonly [string, string]>;

  for (const [type, name] of candidates) {
    const cached = await getSessionFromDb(db, season, round, type);
    const rows = cached?.status === "complete" && cached.results_json
      ? JSON.parse(cached.results_json)
      : (await getOpenF1SessionResults(season, country, name, sessionDate, type === "sprint_qualifying")).results;
    const matching = rows.filter((row: any) =>
      missingNumbers.has(String(row.driverNumber)) &&
      row.lapTime && row.lapTime !== "—" &&
      Number.isFinite(Number(row.position))
    );
    if (matching.length === missingNumbers.size) {
      return new Map(matching.map((row: any) => [String(row.driverNumber), Number(row.position)]));
    }
  }

  return null;
}

async function addMissingQualifyingDrivers(
  db: D1Database,
  season: number,
  round: number,
  country: string,
  sessionDate: string,
  results: any[],
  drivers: OpenF1Driver[],
  openResults: OpenF1ResultRow[],
): Promise<{ results: any[]; ranked: boolean }> {
  const openByNumber = new Map(openResults.map((row) => [String(row.driverNumber), row]));
  results = results.map((row) => {
    const open = openByNumber.get(String(row.number ?? row.Driver?.permanentNumber ?? ""));
    const hasTime = (value: string | undefined) => Boolean(value && value !== "—");
    // A deleted Q1 time with retained Q2/Q3 laps and no OpenF1 position is
    // evidence of a post-session disqualification (for example Miami 2026).
    const disqualified = open?.dsq || (open?.positionReported === false &&
      !hasTime(open?.q1) && (hasTime(open?.q2) || hasTime(open?.q3)) &&
      !hasTime(row.Q1) && !hasTime(row.Q2) && !hasTime(row.Q3));
    return disqualified ? { ...row, dsq: true, noResult: false } : row;
  });
  // Jolpica can omit drivers without a recorded lap. OpenF1's driver list is
  // scoped to this exact session, unlike the season championship standings.
  const recordedNumbers = new Set(
    results.map((row) => String(row.number ?? row.Driver?.permanentNumber ?? ""))
  );
  const missingDrivers = drivers.filter(
    (driver) => !recordedNumbers.has(String(driver.driver_number))
  );
  const missing = missingDrivers
    .map((driver, index) => {
      const names = driver.full_name.trim().split(/\s+/);
      return {
        number: String(driver.driver_number),
        position: String(results.length + index + 1),
        Driver: {
          permanentNumber: String(driver.driver_number),
          code: driver.name_acronym,
          givenName: driver.first_name ?? names[0],
          familyName: driver.last_name ?? names.slice(1).join(" "),
        },
        Constructor: {
          constructorId: getTeamIdFromName(driver.team_name ?? ""),
          name: driver.team_name ?? "",
        },
        noResult: true,
        rosterOnly: true,
      };
    });
  return rankNoTimeQualifiers(
    db, season, round, country, sessionDate,
    [...results, ...missing], false,
  );
}

function needsQualifyingRefresh(row: SessionResultRow, results: any[], sessionDate: string): boolean {
  const positions = results.filter((result) => !result.dsq && !result.noResult)
    .map((result) => Number(result.position));
  if (new Set(positions).size !== positions.length) return true;
  const finalizationTime = new Date(sessionDate).getTime() + 3 * 24 * 60 * 60 * 1000;
  return Number.isFinite(finalizationTime) && Date.now() >= finalizationTime &&
    new Date(row.completed_at ?? 0).getTime() < finalizationTime;
}

function hasQualifyingTime(row: any, isSprintQualifying: boolean): boolean {
  const keys = isSprintQualifying ? ["q1", "q2", "q3"] : ["Q1", "Q2", "Q3"];
  return keys.some((key) => typeof row[key] === "string" && row[key].trim() !== "" && row[key] !== "—");
}

async function rankNoTimeQualifiers(
  db: D1Database,
  season: number,
  round: number,
  country: string,
  sessionDate: string,
  results: any[],
  isSprintQualifying: boolean,
): Promise<{ results: any[]; ranked: boolean }> {
  const number = (row: any) => String(isSprintQualifying
    ? row.driverNumber
    : row.number ?? row.Driver?.permanentNumber ?? "");
  const timed = results.filter((row) => !row.dsq && hasQualifyingTime(row, isSprintQualifying));
  const noTime = results.filter((row) => !row.dsq && !hasQualifyingTime(row, isSprintQualifying));
  const disqualified = results.filter((row) => row.dsq);
  if (!noTime.length) return { results, ranked: true };

  const practiceOrder = await getQualifyingPracticeOrder(
    db, season, round, country, sessionDate,
    new Set(noTime.map(number)), isSprintQualifying,
  );
  if (practiceOrder) {
    noTime.sort((a, b) =>
      practiceOrder.get(number(a))! - practiceOrder.get(number(b))!
    );
  }
  const positionKnown = Boolean(practiceOrder) || noTime.length === 1 || noTime.every((row) =>
    !row.rosterOnly && !row.noResult && row.positionReported !== false && Number.isFinite(Number(row.position))
  );
  return {
    results: [
      ...timed,
      ...noTime.map((row, index) => ({
        ...row,
        position: isSprintQualifying ? timed.length + index + 1 : String(timed.length + index + 1),
        noResult: true,
        qualifyingPositionKnown: positionKnown,
      })),
      ...disqualified,
    ],
    ranked: positionKnown,
  };
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
      let results = JSON.parse(cached.results_json!);

      if (country && sessionDate && sessionType === "qualifying" &&
        (cached.source !== "jolpica+practice" || needsQualifyingRefresh(cached, results, sessionDate))) {
        const refreshed = needsQualifyingRefresh(cached, results, sessionDate)
          ? await getJolpicaQualifying(String(season), String(round)) : null;
        if (refreshed?.length) results = refreshed;
        const session = await getOpenF1SessionResults(season, country, "Qualifying", sessionDate, true);
        if (session.drivers.length) {
          const completed = await addMissingQualifyingDrivers(
            db, season, round, country, sessionDate,
            results, session.drivers, session.results,
          );
          results = completed.results;
          await upsertSession(
            db, season, round, sessionType,
            completed.ranked ? "jolpica+practice" : "jolpica+roster",
            "complete", results,
          );
        } else if (results.some((row: any) => row.noResult)) {
          // A previously cached exact-session roster is sufficient to retry
          // practice ranking when the qualifying roster API is unavailable.
          const completed = await rankNoTimeQualifiers(
            db, season, round, country, sessionDate, results, false,
          );
          results = completed.results;
          await upsertSession(
            db, season, round, sessionType,
            completed.ranked ? "jolpica+practice" : "jolpica+roster",
            "complete", results,
          );
        }
      }

      if (country && sessionDate && sessionType === "sprint_qualifying" && cached.source !== "openf1+practice") {
        let sessionResults: any[] | null = cached.source === "openf1+roster" ? results : null;
        if (!sessionResults) {
          const session = await getOpenF1SessionResults(season, country, "Sprint Qualifying", sessionDate, true);
          if (session.drivers.length && session.results.length) sessionResults = session.results;
        }
        if (sessionResults?.length) {
          const completed = await rankNoTimeQualifiers(
            db, season, round, country, sessionDate, sessionResults, true,
          );
          results = completed.results;
          await upsertSession(
            db, season, round, sessionType,
            completed.ranked ? "openf1+practice" : "openf1+roster",
            "complete", results,
          );
        }
      }

      return json({
        status: "complete",
        results,
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

  let source = OPENF1_SESSIONS.has(sessionType) ? "openf1" : "jolpica";

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

      const session = await getOpenF1SessionResults(
        season,
        country,
        sessionName,
        sessionDate,
        sessionType === "sprint_qualifying"
      );
      results = session.results.length ? session.results : null;
      if (sessionType === "sprint_qualifying" && results && session.drivers.length) {
        const completed = await rankNoTimeQualifiers(
          db, season, round, country, sessionDate, results, true,
        );
        results = completed.results;
        source = completed.ranked ? "openf1+practice" : "openf1+roster";
      }

    } else {
      if (sessionType === "qualifying") {
        results = await getJolpicaQualifying(String(season), String(round));
        if (results?.length && country && sessionDate) {
          const session = await getOpenF1SessionResults(season, country, "Qualifying", sessionDate, true);
          if (session.drivers.length) {
            const completed = await addMissingQualifyingDrivers(
              db, season, round, country, sessionDate, results, session.drivers, session.results,
            );
            results = completed.results;
            source = completed.ranked ? "jolpica+practice" : "jolpica+roster";
          }
        }
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
