import type { SearchResult } from "./resume-search";

export type ReusePathType = "A" | "B" | "C";

// Similarity thresholds — all values are cosine similarity [0, 1]
const THRESH_PATH_A          = 0.85; // near-identical JD: safe to adapt directly
const THRESH_PATH_B          = 0.60; // minimum to attempt any reuse
const THRESH_SKIP_OVERVIEW   = 0.80; // skip company overview step
const THRESH_SKIP_RESEARCH   = 0.82; // skip team research step

export interface ReusePlan {
  path: ReusePathType;
  label: string;
  estimatedCost: string;
  estimatedTime: string;
  referenceResume: SearchResult | null;
  skipCompanyOverview: boolean;
  skipTeamResearch: boolean;
  reuseMode: "adapt" | "reference" | "none";
}

export function decideReusePath(
  topMatches: SearchResult[],
  newCompanyNames: string[]
): ReusePlan {
  const best = topMatches[0] ?? null;

  if (!best || best.similarity < THRESH_PATH_B) {
    return {
      path: "C",
      label: "Full pipeline (new territory)",
      estimatedCost: "~$0.030",
      estimatedTime: "~60s",
      referenceResume: null,
      skipCompanyOverview: false,
      skipTeamResearch: false,
      reuseMode: "none",
    };
  }

  const sameCompanies = newCompanyNames.every((name) =>
    best.companiesJson.some((c) => c.name === name)
  );

  // PATH A: near-identical JD AND same companies AND same user → safe to adapt directly.
  // Cross-user resumes are never used for PATH A to avoid exposing another user's content.
  if (best.similarity >= THRESH_PATH_A && sameCompanies && best.isOwn) {
    return {
      path: "A",
      label: "Draft-and-adapt (very similar JD found)",
      estimatedCost: "~$0.005",
      estimatedTime: "~10s",
      referenceResume: best,
      skipCompanyOverview: true,
      skipTeamResearch: true,
      reuseMode: "adapt",
    };
  }

  // PATH B: for same-user matches we can reuse reference bullets + skip expensive research.
  // For cross-user matches we still benefit from the shared TeamResearch cache but don't
  // expose the other user's resume content (referenceResume = null).
  const ownBest = best.isOwn ? best : null;
  return {
    path: "B",
    label: "Research-skip (similar JD, reusing team data)",
    estimatedCost: "~$0.005",
    estimatedTime: "~15s",
    referenceResume: ownBest,
    skipCompanyOverview: ownBest !== null && sameCompanies && best.similarity >= THRESH_SKIP_OVERVIEW,
    skipTeamResearch: ownBest !== null && sameCompanies && best.similarity >= THRESH_SKIP_RESEARCH,
    reuseMode: ownBest !== null ? "reference" : "none",
  };
}
