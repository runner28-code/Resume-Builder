-- Replace ON DELETE SET NULL with ON DELETE CASCADE on Resume.userId.
-- Migration 004 made the column NOT NULL, so SET NULL would error on User deletion.
ALTER TABLE "Resume" DROP CONSTRAINT IF EXISTS "Resume_userId_fkey";
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
