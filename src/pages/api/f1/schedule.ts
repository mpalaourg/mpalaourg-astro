import type { APIRoute } from "astro";
import { getScheduleFromDb, upsertSchedule } from "../../../utils/f1/db";
import { getSeasonRaces } from "../../../utils/f1/api";

const SCHEDULE_TTL_MS = 24 * 60 * 60 * 1000;

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
  const season = parseInt(url.searchParams.get("season") ?? "");
  if (isNaN(season)) return err("season param required");

  const runtime = locals.runtime as { env: Env };
  const db = runtime.env.DB;

  // 1. Try D1
  const cached = await getScheduleFromDb(db, season);
  if (cached.length > 0) {
    const fetchedAt = new Date(cached[0].fetched_at).getTime();
    const age = Date.now() - fetchedAt;
    if (age < SCHEDULE_TTL_MS) {
      return json({ source: "cache", races: cached.map(transformRace) });
    }
  }

  // 2. Stale or missing — fetch Jolpica
  try {
    const races = await getSeasonRaces(season);
    if (!races.length) {
      if (cached.length > 0) return json({ source: "stale_cache", races: cached.map(transformRace) });
      return json({ source: "upstream", races: [] });
    }
    await upsertSchedule(db, races);
    const fresh = await getScheduleFromDb(db, season);
    return json({ source: "upstream", races: fresh.map(transformRace) });
  } catch (e) {
    if (cached.length > 0) return json({ source: "stale_cache", races: cached.map(transformRace) });
    return err("Failed to fetch schedule", 502);
  }
};
