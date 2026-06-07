-- Initial schema — run once against a fresh PostgreSQL database.
-- Requires the pgvector extension (brew install pgvector on macOS,
-- or CREATE EXTENSION vector; after installing the package).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "User" (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Resume" (
  id                   TEXT PRIMARY KEY,
  "userId"             TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "sessionId"          TEXT NOT NULL,
  "candidateName"      TEXT NOT NULL,
  "jdText"             TEXT NOT NULL,
  "jdEmbedding"        vector(512),
  "jdKeywords"         TEXT[]  NOT NULL DEFAULT '{}',
  "jdIndustry"         TEXT,
  "companiesJson"      JSONB   NOT NULL,
  "teamSelectionsJson" JSONB   NOT NULL,
  "teamResearchKeys"   TEXT[]  NOT NULL DEFAULT '{}',
  "resumeContent"      JSONB   NOT NULL,
  "bulletsByRole"      JSONB   NOT NULL,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "TeamResearch" (
  key         TEXT PRIMARY KEY,
  research    JSONB        NOT NULL,
  "updatedAt" TIMESTAMPTZ  NOT NULL
);

CREATE INDEX IF NOT EXISTS "Resume_userId_idx"     ON "Resume" ("userId");
CREATE INDEX IF NOT EXISTS "Resume_jdIndustry_idx" ON "Resume" ("jdIndustry");
CREATE INDEX IF NOT EXISTS "Resume_sessionId_idx"  ON "Resume" ("sessionId");
