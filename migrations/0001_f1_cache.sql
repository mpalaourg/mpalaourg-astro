CREATE TABLE IF NOT EXISTS races (
  season           INTEGER NOT NULL,
  round            INTEGER NOT NULL,
  race_name        TEXT    NOT NULL,
  circuit_id       TEXT    NOT NULL,
  circuit_name     TEXT    NOT NULL,
  locality         TEXT    NOT NULL,
  country          TEXT    NOT NULL,
  race_date        TEXT    NOT NULL,
  race_time        TEXT,
  fp1_date         TEXT,  fp1_time        TEXT,
  fp2_date         TEXT,  fp2_time        TEXT,
  fp3_date         TEXT,  fp3_time        TEXT,
  qualifying_date  TEXT,  qualifying_time TEXT,
  sprint_date      TEXT,  sprint_time     TEXT,
  sq_date          TEXT,  sq_time         TEXT,
  fetched_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (season, round)
);

CREATE TABLE IF NOT EXISTS session_results (
  season              INTEGER NOT NULL,
  round               INTEGER NOT NULL,
  session_type        TEXT    NOT NULL,
  -- 'openf1' | 'jolpica'
  source              TEXT    NOT NULL,
  -- Stored to skip the session key lookup fetch on future requests
  openf1_session_key  INTEGER,
  -- NULL when status is 'live' or 'pending'
  results_json        TEXT,
  -- 'live'     → OpenF1 blocked the request, session in progress
  -- 'pending'  → session ended but API returned empty/no results yet
  -- 'complete' → results are final, never fetch upstream again
  status              TEXT    NOT NULL DEFAULT 'pending',
  -- NULL until we get a real result back so we know when to stop retrying
  completed_at        TEXT,
  -- Tracks last upstream attempt regardless of outcome
  last_attempted_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  -- How many times we've retried during 'pending' state
  retry_count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season, round, session_type)
);

CREATE TABLE IF NOT EXISTS standings (
  season         INTEGER NOT NULL,
  -- 'drivers' | 'constructors'
  type           TEXT    NOT NULL,
  -- Compared against max complete race round to detect staleness
  after_round    INTEGER NOT NULL DEFAULT 0,
  standings_json TEXT    NOT NULL,
  fetched_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (season, type)
);