-- Run this in your Supabase SQL editor.
-- Creates the User table and adds userId to Resume.

CREATE TABLE IF NOT EXISTS "User" (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Resume"
  ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES "User"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Resume_userId_idx" ON "Resume" ("userId");
