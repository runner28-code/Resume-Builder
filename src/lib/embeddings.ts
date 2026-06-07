import { withRetry } from "@/lib/retry";
import { hashText, getEmbedding, setEmbedding } from "@/lib/embedding-cache";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

async function voyageFetch(input: string | string[], apiKey?: string | null): Promise<number[][]> {
  const empty = Array.isArray(input) ? input.map(() => []) : [[]];
  try {
    return await withRetry(async () => {
      const res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey || process.env.VOYAGE_API_KEY!}`,
        },
        body: JSON.stringify({ input, model: "voyage-3-lite" }),
      });
      if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return data.data?.map((d) => d.embedding) ?? empty;
    });
  } catch (err) {
    console.error("[Voyage] embed failed after retries:", err);
    return empty;
  }
}

export async function embedJD(jdText: string, apiKey?: string | null): Promise<number[]> {
  const key = hashText(jdText.slice(0, 4000));
  const cached = await getEmbedding(key);
  if (cached) return cached;
  const results = await voyageFetch(jdText.slice(0, 4000), apiKey);
  const embedding = results[0] ?? [];
  if (embedding.length > 0) await setEmbedding(key, embedding);
  return embedding;
}

export async function embedJDBatch(jdTexts: string[], apiKey?: string | null): Promise<number[][]> {
  if (jdTexts.length === 0) return [];
  const sliced = jdTexts.map((t) => t.slice(0, 4000));
  const keys   = sliced.map(hashText);

  // Check cache for each; collect which indices need a Voyage call
  const results: number[][] = new Array(sliced.length).fill([]);
  const missIndices: number[] = [];
  await Promise.all(keys.map(async (k, i) => {
    const cached = await getEmbedding(k);
    if (cached) results[i] = cached;
    else missIndices.push(i);
  }));

  if (missIndices.length > 0) {
    const fetched = await voyageFetch(missIndices.map((i) => sliced[i]), apiKey);
    await Promise.all(missIndices.map(async (origIdx, fetchIdx) => {
      const emb = fetched[fetchIdx] ?? [];
      results[origIdx] = emb;
      if (emb.length > 0) await setEmbedding(keys[origIdx], emb);
    }));
  }

  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}
