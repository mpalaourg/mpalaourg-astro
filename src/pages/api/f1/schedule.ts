import type { APIRoute } from "astro";
import { getScheduleFromDb, upsertSchedule } from "../../../utils/f1/db";
import { getSeasonRaces } from "../../../utils/f1/api";
import { getEdgeResponse, putEdgeResponse, type EdgeCacheRuntime } from "../../../utils/f1/edge-cache";

const SCHEDULE_TTL_MS = 24 * 60 * 60 * 1000;

function json(data: unknown, status = 200, browserTtl = 300, edgeTtl = 900): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": status === 200
        ? `public, max-age=${browserTtl}, s-maxage=${edgeTtl}`
        : "no-store",
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// Transform DB row to Jolpica format expected by widget
function transformRace(row: any) {
  return {
    season: String(row.season),
    round: String(row.round),
    raceName: row.race_name,
    date: row.race_date,
    time: row.race_time,
    Circuit: {
      circuitId: row.circuit_id,
      circuitName: row.circuit_name,
      Location: {
        locality: row.locality,
        country: row.country,
      },
    },
    FirstPractice: row.fp1_date ? {
      date: row.fp1_date,
      time: row.fp1_time,
    } : undefined,
    SecondPractice: row.fp2_date ? {
      date: row.fp2_date,
      time: row.fp2_time,
    } : undefined,
    ThirdPractice: row.fp3_date ? {
      date: row.fp3_date,
      time: row.fp3_time,
    } : undefined,
    Qualifying: row.qualifying_date ? {
      date: row.qualifying_date,
      time: row.qualifying_time,
    } : undefined,
    Sprint: row.sprint_date ? {
      date: row.sprint_date,
      time: row.sprint_time,
    } : undefined,
    SprintQualifying: row.sq_date ? {
      date: row.sq_date,
      time: row.sq_time,
    } : undefined,
  };
}

export const GET: APIRoute = async ({ url, locals }) => {
  const seasonParam = url.searchParams.get("season") ?? "";
  const season = Number(seasonParam);
  if (!/^\d{4}$/.test(seasonParam) || season < 1950 || season > new Date().getUTCFullYear() + 1) return err("Invalid season");

  const runtime = locals.runtime as { env: Env } & EdgeCacheRuntime;
  const cacheKey = new URL(`/api/f1/schedule?season=${season}`, url.origin);
  const edgeHit = await getEdgeResponse(runtime, cacheKey);
  if (edgeHit) return edgeHit;
  const respond = (data: unknown, browserTtl = 300, edgeTtl = 900) => {
    const response = json(data, 200, browserTtl, edgeTtl);
    putEdgeResponse(runtime, cacheKey, response);
    return response;
  };
  const db = runtime.env.DB;

  // 1. Try D1
  const cached = await getScheduleFromDb(db, season);
  if (cached.length > 0) {
    const fetchedAt = new Date(cached[0].fetched_at).getTime();
    const age = Date.now() - fetchedAt;
    if (age < SCHEDULE_TTL_MS) {
      return respond({ source: "cache", races: cached.map(transformRace) });
    }
  }

  // 2. Stale or missing — fetch Jolpica
  try {
    const races = await getSeasonRaces(season);
    if (!races.length) {
      if (cached.length > 0) return respond({ source: "stale_cache", races: cached.map(transformRace) }, 15, 30);
      return respond({ source: "upstream", races: [] }, 15, 30);
    }
    await upsertSchedule(db, races);
    const fresh = await getScheduleFromDb(db, season);
    return respond({ source: "upstream", races: fresh.map(transformRace) });
  } catch (e) {
    if (cached.length > 0) return respond({ source: "stale_cache", races: cached.map(transformRace) }, 15, 30);
    return err("Failed to fetch schedule", 502);
  }
};
