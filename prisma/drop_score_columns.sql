-- Run this in Supabase SQL editor to drop the score columns removed from the schema.
ALTER TABLE "Resume" DROP COLUMN IF EXISTS "atsScore";
ALTER TABLE "Resume" DROP COLUMN IF EXISTS "recruiterScore";
ALTER TABLE "Resume" DROP COLUMN IF EXISTS "hmScore";
