-- Persistent JD analysis cache (survives server restarts, 7-day TTL enforced in code)
CREATE TABLE IF NOT EXISTS "JdAnalysisCache" (
  key         TEXT PRIMARY KEY,
  analysis    JSONB        NOT NULL,
  "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Persistent JD embedding cache (survives server restarts, 30-day TTL enforced in code)
CREATE TABLE IF NOT EXISTS "EmbeddingCache" (
  key         TEXT PRIMARY KEY,
  embedding   vector(512)  NOT NULL,
  "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
