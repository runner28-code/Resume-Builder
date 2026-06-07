import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const TTL_DAYS = 30;

export function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export async function getEmbedding(key: string): Promise<number[] | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ embedding: string; updatedAt: Date }>>`
      SELECT "embedding"::text, "updatedAt" FROM "EmbeddingCache" WHERE key = ${key} LIMIT 1
    `;
    if (rows.length === 0) return null;
    const ageMs = Date.now() - new Date(rows[0].updatedAt).getTime();
    if (ageMs > TTL_DAYS * 24 * 60 * 60 * 1000) return null;
    return JSON.parse(rows[0].embedding) as number[];
  } catch {
    return null;
  }
}

export async function setEmbedding(key: string, embedding: number[]): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "EmbeddingCache" (key, embedding, "updatedAt")
      VALUES (${key}, ${JSON.stringify(embedding)}::vector, NOW())
      ON CONFLICT (key) DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = NOW()
    `;
  } catch (err) {
    console.warn("[embedding-cache] DB write failed (non-fatal):", String(err));
  }
}
