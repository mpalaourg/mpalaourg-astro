import type { APIRoute } from "astro";
import {
  getStandingsFromDb,
  getLatestCompleteRound,
  upsertStandings,
} from "../../../utils/f1/db";
import {
  getDriverStandings,
  getConstructorStandings,
} from "../../../utils/f1/api";

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
  if (cached && cached.after_round >= latestComplete) {
    return json({
      source: "cache",
      standings: JSON.parse(cached.standings_json),
    });
  }

  try {
    const data =
      type === "drivers"
        ? await getDriverStandings()
        : await getConstructorStandings();

    await upsertStandings(db, season, type, latestComplete, data);
    return json({ source: "upstream", standings: data });
  } catch {
    if (cached) {
      return json({ source: "stale_cache", standings: JSON.parse(cached.standings_json) });
    }
    return err("Failed to fetch standings", 502);
  }
};
