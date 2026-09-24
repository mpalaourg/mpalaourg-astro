-- Bound calls to the paid translation provider. Keys contain only a hash of the
-- visitor IP (or a global key), never an address or translation text.
CREATE TABLE IF NOT EXISTS translation_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  used INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_translation_limits_window
  ON translation_limits(window_start);
