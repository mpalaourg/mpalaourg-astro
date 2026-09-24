import type { APIRoute } from "astro";
import {
  getStandingsFromDb,
  getLatestCompleteRound,
  upsertStandings,
} from "../../../utils/f1/db";
import { getChampionshipStandings } from "../../../utils/f1/api";

const STANDINGS_TTL_MS = 15 * 60 * 1000;

function cacheAgeMs(fetchedAt: string): number {
  const time = new Date(`${fetchedAt.replace(" ", "T")}Z`).getTime();
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

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

export const GET: APIRoute = async ({ url, locals }) => {
  const season = parseInt(url.searchParams.get("season") ?? "");
  const type = url.searchParams.get("type") as
    | "drivers"
    | "constructors"
    | null;

  if (isNaN(season) || !type) return err("season, type params required");
  if (type !== "drivers" && type !== "constructors") {
    return err("type must be drivers or constructors");
  }

  const runtime = locals.runtime as { env: Env };
  const db = runtime.env.DB;

  const latestComplete = await getLatestCompleteRound(db, season);

  const cached = await getStandingsFromDb(db, season, type);
  if (cached && cached.after_round >= latestComplete &&
    cacheAgeMs(cached.fetched_at) < STANDINGS_TTL_MS) {
    return json({
      source: "cache",
      standings: JSON.parse(cached.standings_json),
    });
  }

  try {
    const snapshot = await getChampionshipStandings(season, type);
    if (cached && snapshot.round < cached.after_round) {
      const standings = JSON.parse(cached.standings_json);
      await upsertStandings(db, season, type, cached.after_round, standings);
      return json({ source: "cache", standings });
    }
    await upsertStandings(db, season, type, snapshot.round, snapshot.standings);
    return json({ source: "upstream", standings: snapshot.standings });
  } catch {
    if (cached) {
      return json({ source: "stale_cache", standings: JSON.parse(cached.standings_json) });
    }
    return err("Failed to fetch standings", 502);
  }
};
