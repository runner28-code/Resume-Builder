-- Make Resume.userId NOT NULL.
-- If any rows have a NULL userId (e.g. from a bug or early schema), delete them first.
DELETE FROM "Resume" WHERE "userId" IS NULL;
ALTER TABLE "Resume" ALTER COLUMN "userId" SET NOT NULL;
