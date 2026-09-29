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

function json(data: unknown, status = 200, browserTtl = 15): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": status === 200
        ? `public, max-age=${browserTtl}`
        : "no-store",
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export const GET: APIRoute = async ({ url, locals }) => {
  const seasonParam = url.searchParams.get("season") ?? "";
  const season = Number(seasonParam);
  const type = url.searchParams.get("type") as
    | "drivers"
    | "constructors"
    | null;

  if (!/^\d{4}$/.test(seasonParam) || season < 1950 || season > new Date().getUTCFullYear() + 1 || !type) return err("Invalid season or type");
  if (type !== "drivers" && type !== "constructors") {
    return err("type must be drivers or constructors");
  }

  const runtime = locals.runtime as { env: Env };
  const respond = (data: unknown, browserTtl = 15) => json(data, 200, browserTtl);
  const db = runtime.env.DB;

  let latestComplete = 0;
  let cached: Awaited<ReturnType<typeof getStandingsFromDb>> = null;
  try {
    latestComplete = await getLatestCompleteRound(db, season);
    cached = await getStandingsFromDb(db, season, type);
  } catch (error) {
    console.error("F1 standings cache read failed:", error);
  }
  if (cached && cached.after_round >= latestComplete &&
    cacheAgeMs(cached.fetched_at) < STANDINGS_TTL_MS) {
    return respond({
      source: "cache",
      standings: JSON.parse(cached.standings_json),
    });
  }

  try {
    const snapshot = await getChampionshipStandings(season, type);
    if (cached && snapshot.round < cached.after_round) {
      const standings = JSON.parse(cached.standings_json);
      try {
        await upsertStandings(db, season, type, cached.after_round, standings);
      } catch (error) {
        console.error("F1 standings cache write failed:", error);
      }
      return respond({ source: "cache", standings });
    }
    try {
      await upsertStandings(db, season, type, snapshot.round, snapshot.standings);
    } catch (error) {
      console.error("F1 standings cache write failed:", error);
    }
    return respond({ source: "upstream", standings: snapshot.standings });
  } catch {
    if (cached) {
      return respond({ source: "stale_cache", standings: JSON.parse(cached.standings_json) }, 5);
    }
    return err("Failed to fetch standings", 502);
  }
};
