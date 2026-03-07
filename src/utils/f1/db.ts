import type { OpenF1ResultRow } from "../../../src/utils/f1/types";

export interface RaceRow {
  season: number;
  round: number;
  race_name: string;
  circuit_id: string;
  circuit_name: string;
  locality: string;
  country: string;
  race_date: string;
  race_time: string | null;
  fp1_date: string | null;   fp1_time: string | null;
  fp2_date: string | null;   fp2_time: string | null;
  fp3_date: string | null;   fp3_time: string | null;
  qualifying_date: string | null; qualifying_time: string | null;
  sprint_date: string | null;     sprint_time: string | null;
  sq_date: string | null;         sq_time: string | null;
  fetched_at: string;
}

export interface SessionResultRow {
  season: number;
  round: number;
  session_type: string;
  source: string;
  openf1_session_key: number | null;
  results_json: string | null;
  status: "live" | "pending" | "complete";
  completed_at: string | null;
  last_attempted_at: string;
  retry_count: number;
}

export interface StandingsRow {
  season: number;
  type: string;
  after_round: number;
  standings_json: string;
  fetched_at: string;
}

// ─── Races ────────────────────────────────────────────────────────────────────

export async function getScheduleFromDb(
  db: D1Database,
  season: number
): Promise<RaceRow[]> {
  const result = await db
    .prepare("SELECT * FROM races WHERE season = ? ORDER BY round ASC")
    .bind(season)
    .all<RaceRow>();
  return result.results;
}

export async function upsertSchedule(
  db: D1Database,
  races: any[]
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO races (
      season, round, race_name, circuit_id, circuit_name,
      locality, country, race_date, race_time,
      fp1_date, fp1_time, fp2_date, fp2_time, fp3_date, fp3_time,
      qualifying_date, qualifying_time, sprint_date, sprint_time,
      sq_date, sq_time, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(season, round) DO UPDATE SET
      race_name        = excluded.race_name,
      race_date        = excluded.race_date,
      race_time        = excluded.race_time,
      fp1_date         = excluded.fp1_date,   fp1_time         = excluded.fp1_time,
      fp2_date         = excluded.fp2_date,   fp2_time         = excluded.fp2_time,
      fp3_date         = excluded.fp3_date,   fp3_time         = excluded.fp3_time,
      qualifying_date  = excluded.qualifying_date, qualifying_time = excluded.qualifying_time,
      sprint_date      = excluded.sprint_date, sprint_time     = excluded.sprint_time,
      sq_date          = excluded.sq_date,    sq_time          = excluded.sq_time,
      fetched_at       = datetime('now')
  `);

  // D1 batch — one round-trip for all rows
  await db.batch(
  races.map((r) =>
    stmt.bind(
      parseInt(r.season),
      parseInt(r.round),
      r.raceName,
      r.Circuit.circuitId,
      r.Circuit.circuitName,
      r.Circuit.Location.locality,
      r.Circuit.Location.country,
      r.date,
      r.time ?? null,
      r.FirstPractice?.date ?? null,
      r.FirstPractice?.time ?? null,
      r.SecondPractice?.date ?? null,
      r.SecondPractice?.time ?? null,
      r.ThirdPractice?.date ?? null,
      r.ThirdPractice?.time ?? null,
      r.Qualifying?.date ?? null,
      r.Qualifying?.time ?? null,
      r.Sprint?.date ?? null,
      r.Sprint?.time ?? null,
      r.SprintQualifying?.date ?? null,
      r.SprintQualifying?.time ?? null
    )
  )
);
}

// ─── Session Results ──────────────────────────────────────────────────────────

export async function getSessionFromDb(
  db: D1Database,
  season: number,
  round: number,
  sessionType: string
): Promise<SessionResultRow | null> {
  const result = await db
    .prepare(
      "SELECT * FROM session_results WHERE season = ? AND round = ? AND session_type = ?"
    )
    .bind(season, round, sessionType)
    .first<SessionResultRow>();
  return result ?? null;
}

export async function upsertSession(
  db: D1Database,
  season: number,
  round: number,
  sessionType: string,
  source: string,
  status: "live" | "pending" | "complete",
  results: OpenF1ResultRow[] | any[] | null,
  openf1SessionKey?: number | null
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO session_results (
        season, round, session_type, source, openf1_session_key,
        results_json, status, completed_at, last_attempted_at, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)
      ON CONFLICT(season, round, session_type) DO UPDATE SET
        source              = excluded.source,
        openf1_session_key  = COALESCE(excluded.openf1_session_key, openf1_session_key),
        results_json        = excluded.results_json,
        status              = excluded.status,
        completed_at        = CASE WHEN excluded.status = 'complete' THEN datetime('now') ELSE completed_at END,
        last_attempted_at   = datetime('now'),
        retry_count         = CASE WHEN excluded.status = 'pending' THEN retry_count + 1 ELSE retry_count END
    `)
    .bind(
      season,
      round,
      sessionType,
      source,
      openf1SessionKey ?? null,
      results ? JSON.stringify(results) : null,
      status,
      status === "complete" ? new Date().toISOString() : null
    )
    .run();
}

// ─── Standings ────────────────────────────────────────────────────────────────

export async function getStandingsFromDb(
  db: D1Database,
  season: number,
  type: "drivers" | "constructors"
): Promise<StandingsRow | null> {
  const result = await db
    .prepare("SELECT * FROM standings WHERE season = ? AND type = ?")
    .bind(season, type)
    .first<StandingsRow>();
  return result ?? null;
}

export async function getLatestCompleteRound(
  db: D1Database,
  season: number
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT MAX(round) as max_round FROM session_results
       WHERE season = ? AND session_type = 'race' AND status = 'complete'`
    )
    .bind(season)
    .first<{ max_round: number | null }>();
  return result?.max_round ?? 0;
}

export async function upsertStandings(
  db: D1Database,
  season: number,
  type: "drivers" | "constructors",
  afterRound: number,
  data: any[]
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO standings (season, type, after_round, standings_json, fetched_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(season, type) DO UPDATE SET
        after_round    = excluded.after_round,
        standings_json = excluded.standings_json,
        fetched_at     = datetime('now')
    `)
    .bind(season, type, afterRound, JSON.stringify(data))
    .run();
}