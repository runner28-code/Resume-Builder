// Prisma v7 config — provides the datasource URL to the CLI (Next.js .env.local is not
// exposed to the Prisma CLI automatically, so we load it here via dotenv).
import "dotenv/config";
import path from "path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local for Prisma CLI (Next.js doesn't expose it to the CLI automatically)
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "postgresql://placeholder:placeholder@localhost/placeholder",
  },
});
