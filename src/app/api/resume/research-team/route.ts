import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { makeAnthropicClient, MODELS } from "@/lib/anthropic";
import { tavilySearch, engineeringDomain, dedupeResults } from "@/lib/tavily";
import { calcClaudeCost } from "@/lib/cost";
import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/concurrency";
import { getSessionUser } from "@/lib/session";

const CACHE_TTL_DAYS = 180;

// Per-process in-flight map: deduplicates concurrent requests for the same cache key
// so parallel jobs sharing the same candidate companies only trigger one Tavily+Haiku call.
const inFlight = new Map<string, Promise<{ research: object; cost: number }>>();

const TeamSchema = z.object({
  company: z.string().min(1),
  team: z.string().min(1),
  role: z.string().default(""),
  startDate: z.string(),
  endDate: z.string(),
});

const Schema = z.object({
  teams: z.array(TeamSchema),
});

async function getCached(key: string): Promise<object | null> {
  const rows = await prisma.$queryRaw<Array<{ research: string; updatedAt: Date }>>`
    SELECT research::text, "updatedAt" FROM "TeamResearch" WHERE key = ${key} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const ageMs = Date.now() - new Date(rows[0].updatedAt).getTime();
  if (ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
  return JSON.parse(rows[0].research);
}

async function setCache(key: string, research: object): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "TeamResearch" (key, research, "updatedAt")
      VALUES (${key}, ${JSON.stringify(research)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET research = EXCLUDED.research, "updatedAt" = NOW()
    `;
  } catch (err) {
    console.warn("[research-team] cache write failed (non-fatal):", String(err));
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  const { teams } = result.data;
  if (!await getSessionUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const anthropic = makeAnthropicClient(req.headers.get("x-anthropic-key"));
  const tavilyKey = req.headers.get("x-tavily-key");

  try {
    const teamResearch: Record<string, object> = {};
    const currentYear = new Date().getFullYear().toString();

    const teamCosts = await mapWithConcurrency(teams, 2, async (t): Promise<number> => {
      const startYear = t.startDate.slice(0, 4);
      const endYear = /^present$/i.test(t.endDate.trim()) ? currentYear : t.endDate.slice(0, 4);
      const cacheKey = `${t.company}::${t.team}::${startYear}-${endYear}`;
      const responseKey = `${t.company}::${t.team}`;

      // DB cache hit
      const cached = await getCached(cacheKey);
      if (cached) {
        teamResearch[responseKey] = cached;
        console.log("[research-team] cache hit:", cacheKey);
        return 0;
      }

      // In-flight dedup: if another concurrent job is already fetching the same key, share its result
      const existing = inFlight.get(cacheKey);
      if (existing) {
        console.log("[research-team] in-flight dedup:", cacheKey);
        try {
          const result = await existing;
          teamResearch[responseKey] = result.research;
        } catch {
          teamResearch[responseKey] = {};
        }
        return 0; // creator already counted this cost
      }

      // Cache miss + no in-flight — fetch Tavily + Haiku
      const fetchPromise = (async (): Promise<{ research: object; cost: number }> => {
        const blogDomain = engineeringDomain(t.company);
        const role = t.role || "engineer";

        // Query A: role + temporal anchor (general web)
        // Query B: engineering blog / tech stack (domain-focused when known)
        const [roleResults, techResults] = await Promise.all([
          tavilySearch(
            `"${t.company}" "${t.team}" "${role}" engineering ${startYear} ${endYear}`,
            4, tavilyKey
          ),
          tavilySearch(
            `${t.company} "${t.team}" tech stack projects ${startYear}`,
            4, tavilyKey,
            blogDomain ? [blogDomain] : undefined
          ),
        ]);

        const merged = dedupeResults([...roleResults, ...techResults]).slice(0, 7);
        const context = merged
          .map((r) => `SOURCE: ${r.url}\n${r.title}\n${r.content}`)
          .join("\n\n---\n\n");

        const response = await anthropic.messages.create({
          model: MODELS.FAST,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Research the ${t.team} team at ${t.company} for a candidate who worked there as "${role}" from ${t.startDate} to ${t.endDate}.

IMPORTANT: Focus ONLY on what this team was doing during ${t.startDate}–${t.endDate}. Ignore anything from after ${endYear}.

Synthesize into structured JSON optimised for resume bullet generation.

Return ONLY valid JSON:
{
  "techStack": ["tech1", "tech2"],
  "keyProjects": [
    {
      "name": "project name",
      "problem": "the technical problem it solved",
      "solution": "how engineers built it",
      "scale": "approximate scale (users / requests / data volume)",
      "outcome": "business or reliability impact"
    }
  ],
  "typicalOwnership": ["specific thing engineers in this role owned end-to-end"],
  "hardChallenges": ["a concrete technical challenge the team was known for"],
  "approximateScale": "one sentence on system scale during this period"
}

Context:
${context.slice(0, 4000)}`,
            },
          ],
        });

        const cost = calcClaudeCost(MODELS.FAST, response.usage as { input_tokens: number; output_tokens: number });
        const text = (response.content[0] as { type: string; text: string }).text;
        const match = text.match(/\{[\s\S]*\}/);
        const research = match ? JSON.parse(match[0]) : {};
        await setCache(cacheKey, research);
        return { research: research as object, cost };
      })().finally(() => inFlight.delete(cacheKey));

      inFlight.set(cacheKey, fetchPromise);

      try {
        const result = await fetchPromise;
        teamResearch[responseKey] = result.research;
        return result.cost;
      } catch {
        teamResearch[responseKey] = {};
        return 0;
      }
    });

    const claudeCost = teamCosts.reduce((sum, c) => sum + c, 0);
    return NextResponse.json({ teamResearch, claudeCost });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
