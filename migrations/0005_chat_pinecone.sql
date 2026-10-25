-- Additive; no history, visitor allowance or database is deleted.
-- Resolve remote record IDs to reviewed local evidence and citation URLs.
CREATE TABLE chat_pinecone_chunks (
  id TEXT PRIMARY KEY,
  knowledge_rowid INTEGER NOT NULL UNIQUE
);
-- Independent of deletable history and public-corpus replacement.
CREATE TABLE chat_pinecone_usage (
  month TEXT PRIMARY KEY,
  reranks INTEGER NOT NULL CHECK(reranks BETWEEN 1 AND 500),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1))
);

-- Reviewed metadata only; recreated safely with the public corpus import.
CREATE TABLE IF NOT EXISTS chat_pinecone_metadata (
  id TEXT PRIMARY KEY,
  metadata TEXT NOT NULL
);

-- Shared, server-only answers for the eight public starter prompts. No visitors,
-- questions/history or credentials form part of a cache entry.
CREATE TABLE IF NOT EXISTS chat_starter_cache (
  cache_key TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Published image evidence, separate from vector text and visitor history.
CREATE TABLE IF NOT EXISTS chat_source_images (
  source_url TEXT PRIMARY KEY,
  images TEXT NOT NULL
);
