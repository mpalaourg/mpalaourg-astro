-- Cache table for storing temporary computed data
-- Used for API responses, widget data, etc.

CREATE TABLE IF NOT EXISTS cache (
  key         TEXT PRIMARY KEY NOT NULL,
  data        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,  -- Unix timestamp in milliseconds
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for efficient cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
