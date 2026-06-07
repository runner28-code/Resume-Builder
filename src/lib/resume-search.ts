import { prisma } from "@/lib/prisma";
import { embedJD, cosineSimilarity } from "@/lib/embeddings";
import { calcVoyageCost } from "@/lib/cost";

export interface SearchResult {
  resumeId: string;
  /** Pure JD embedding cosine similarity — company overlap is NOT included */
  similarity: number;
  companyOverlap: number;
  jdIndustry: string | null;
  /** True when this resume belongs to the requesting user — required for PATH A. */
  isOwn: boolean;
  teamSelections: Record<string, { selectedTeam: string; reason: string }>;
  teamResearchKeys: string[];
  bulletsByRole: Record<string, string[]>;
  resumeContent: object;
  companiesJson: Array<{ name: string; startDate: string; endDate: string }>;
}

export async function findSimilarResumes(
  newJDText: string,
  newCompanyNames: string[],
  topK = 5,
  voyageApiKey?: string | null,
  currentUserId?: string | null,
  precomputedEmbedding?: number[]
): Promise<{ results: SearchResult[]; voyageCost: number }> {
  const embeddingWasFree = !!(precomputedEmbedding && precomputedEmbedding.length > 0);
  const newEmbedding = embeddingWasFree
    ? precomputedEmbedding!
    : await embedJD(newJDText, voyageApiKey);
  if (newEmbedding.length === 0) return { results: [], voyageCost: 0 };

  const candidates = await prisma.$queryRaw<
    Array<{
      id: string;
      userId: string | null;
      jdEmbedding: string;
      jdIndustry: string | null;
      teamSelectionsJson: string;
      teamResearchKeys: string[];
      bulletsByRole: string;
      resumeContent: string;
      companiesJson: string;
    }>
  >`
    SELECT
      id,
      "userId",
      "jdEmbedding"::text,
      "jdIndustry",
      "teamSelectionsJson"::text,
      "teamResearchKeys",
      "bulletsByRole"::text,
      "resumeContent"::text,
      "companiesJson"::text
    FROM "Resume"
    WHERE "jdEmbedding" IS NOT NULL
    AND "userId" = ${currentUserId ?? ""}
    ORDER BY "jdEmbedding" <=> ${JSON.stringify(newEmbedding)}::vector
    LIMIT ${topK * 3}
  `;

  if (candidates.length === 0) return { results: [], voyageCost: embeddingWasFree ? 0 : calcVoyageCost(newJDText.length) };

  type CandidateRow = typeof candidates[number];

  const scored: SearchResult[] = candidates
    .flatMap((row: CandidateRow) => {
      try {
        const storedEmbedding: number[] = JSON.parse(row.jdEmbedding);
        const jdSimilarity = cosineSimilarity(newEmbedding, storedEmbedding);

        const storedCompanies: Array<{ name: string }> = JSON.parse(row.companiesJson);
        const storedCompanyNames = storedCompanies.map((c) => c.name);
        const companyOverlap =
          newCompanyNames.filter((n) => storedCompanyNames.includes(n)).length /
          Math.max(newCompanyNames.length, 1);

        return [{
          resumeId: row.id,
          similarity: jdSimilarity,
          companyOverlap,
          jdIndustry: row.jdIndustry,
          isOwn: !!currentUserId && row.userId === currentUserId,
          teamSelections: JSON.parse(row.teamSelectionsJson),
          teamResearchKeys: row.teamResearchKeys,
          bulletsByRole: JSON.parse(row.bulletsByRole),
          resumeContent: JSON.parse(row.resumeContent),
          companiesJson: JSON.parse(row.companiesJson),
        }];
      } catch (err) {
        console.warn("[resume-search] skipping malformed row:", row.id, String(err));
        return [];
      }
    })
    .sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity)
    .slice(0, topK);

  return { results: scored, voyageCost: embeddingWasFree ? 0 : calcVoyageCost(newJDText.length) };
}
