-- Initial site guide schema. Consolidated before the first release.
-- Anonymous browser ownership. Daily usage is independent of deletable history.
CREATE TABLE chat_threads (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0, questions INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  persona TEXT NOT NULL DEFAULT 'baseline'
    CHECK (persona IN ('baseline','fun','race-engineer','formal','concise'))
);
CREATE INDEX chat_threads_owner ON chat_threads(owner, updated_at);
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  question TEXT NOT NULL, answer TEXT, sources TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
  model TEXT,
  persona TEXT NOT NULL DEFAULT 'baseline'
    CHECK (persona IN ('baseline','fun','race-engineer','formal','concise')),
  context_sources TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX chat_messages_thread ON chat_messages(thread_id, created_at);
CREATE TABLE chat_usage (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, visitor TEXT NOT NULL,
  day INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX chat_usage_day ON chat_usage(day, visitor);
CREATE INDEX chat_usage_recent ON chat_usage(visitor, created_at);
-- SQLite serializes writes. All checks and the question increment belong to
-- the SAME insert transaction; parallel requests cannot overrun a quota.
CREATE TRIGGER chat_reserve BEFORE INSERT ON chat_usage BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM chat_usage WHERE day = NEW.day) >= 200
    THEN RAISE(ABORT, 'chat_global_limit') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM chat_usage WHERE visitor = NEW.visitor) >= 10
    THEN RAISE(ABORT, 'chat_visitor_limit') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM chat_usage WHERE visitor = NEW.visitor AND created_at > NEW.created_at - 60000) >= 3
    THEN RAISE(ABORT, 'chat_burst_limit') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM chat_threads WHERE id = NEW.thread_id AND archived = 0 AND questions < 4)
    THEN RAISE(ABORT, 'chat_thread_limit') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM chat_messages WHERE thread_id = NEW.thread_id AND status = 'pending')
    THEN RAISE(ABORT, 'chat_busy') END;
  UPDATE chat_threads SET questions = questions + 1, updated_at = NEW.created_at WHERE id = NEW.thread_id;
END;
CREATE VIRTUAL TABLE chat_knowledge USING fts5(title, url UNINDEXED, body, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE chat_index_meta (id INTEGER PRIMARY KEY CHECK(id=1), version TEXT NOT NULL, indexed_at TEXT NOT NULL);

-- Pin the visitor timezone so changing browser preferences cannot refill limits.
CREATE TABLE chat_visitors (
  visitor TEXT PRIMARY KEY, time_zone TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX chat_visitors_expiry ON chat_visitors(updated_at);
