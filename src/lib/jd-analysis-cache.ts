import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// L1: in-process cache (fast path, resets on restart)
interface L1Entry { analysis: object; claudeCost: number; cachedAt: number }
const _l1 = new Map<string, L1Entry>();
const L1_TTL_MS  = 60 * 60 * 1000;   // 1 hour
const L1_MAX     = 200;

// L2: DB cache (survives restarts)
const DB_TTL_DAYS = 7;

export function hashJD(jdText: string): string {
  return createHash("sha256").update(jdText.trim()).digest("hex");
}

export function getAnalysisCacheL1(hash: string): { analysis: object; claudeCost: number } | null {
  const entry = _l1.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > L1_TTL_MS) { _l1.delete(hash); return null; }
  return { analysis: entry.analysis, claudeCost: entry.claudeCost };
}

function setL1(hash: string, data: { analysis: object; claudeCost: number }): void {
  if (_l1.size >= L1_MAX) {
    const oldest = _l1.keys().next().value;
    if (oldest !== undefined) _l1.delete(oldest);
  }
  _l1.set(hash, { ...data, cachedAt: Date.now() });
}

export async function getAnalysisCache(hash: string): Promise<{ analysis: object; claudeCost: number } | null> {
  const l1 = getAnalysisCacheL1(hash);
  if (l1) return l1;

  try {
    const rows = await prisma.$queryRaw<Array<{ analysis: string; updatedAt: Date }>>`
      SELECT analysis::text, "updatedAt" FROM "JdAnalysisCache" WHERE key = ${hash} LIMIT 1
    `;
    if (rows.length === 0) return null;
    const ageMs = Date.now() - new Date(rows[0].updatedAt).getTime();
    if (ageMs > DB_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
    const data = { analysis: JSON.parse(rows[0].analysis) as object, claudeCost: 0 };
    setL1(hash, data);
    return data;
  } catch {
    return null; // DB miss is non-fatal
  }
}

export async function setAnalysisCache(hash: string, data: { analysis: object; claudeCost: number }): Promise<void> {
  setL1(hash, data);
  try {
    await prisma.$executeRaw`
      INSERT INTO "JdAnalysisCache" (key, analysis, "updatedAt")
      VALUES (${hash}, ${JSON.stringify(data.analysis)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET analysis = EXCLUDED.analysis, "updatedAt" = NOW()
    `;
  } catch (err) {
    console.warn("[jd-analysis-cache] DB write failed (non-fatal):", String(err));
  }
}
