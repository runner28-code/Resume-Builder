import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { makeAnthropicClient, MODELS } from "@/lib/anthropic";
import { tavilySearch, engineeringDomain, dedupeResults } from "@/lib/tavily";
import { calcClaudeCost } from "@/lib/cost";
import { mapWithConcurrency } from "@/lib/concurrency";
import { getSessionUser } from "@/lib/session";

const BIG_TECH = new Set([
  "google", "meta", "facebook", "apple", "amazon", "microsoft", "netflix",
  "twitter", "x", "linkedin", "uber", "airbnb", "salesforce", "oracle",
  "ibm", "intel", "nvidia", "adobe", "vmware", "atlassian",
]);

function isBigTech(name: string): boolean {
  return BIG_TECH.has(name.toLowerCase().split(/[\s,]/)[0]);
}

// Strip seniority levels to produce a clean team descriptor for fallback
function teamFallback(role: string): string {
  if (!role) return "Software Engineering";
  const cleaned = role
    .replace(/\b(senior|staff|principal|lead|jr\.?|junior|associate|distinguished|i{1,3}|iv)\b/gi, "")
    .trim();
  return cleaned || "Software Engineering";
}

const CompanySchema = z.object({
  name: z.string().min(1),
  role: z.string().default(""),
  startDate: z.string(),
  endDate: z.string(),
});

const Schema = z.object({
  companies: z.array(CompanySchema),
  jdAnalysis: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  const { companies, jdAnalysis } = result.data;
  if (!await getSessionUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Compact JD summary — only fields needed for team selection
  const jdSummary = JSON.stringify({
    targetIndustry: jdAnalysis.targetIndustry,
    companyType: jdAnalysis.companyType,
    hardRequirements: jdAnalysis.hardRequirements,
    primaryLanguages: jdAnalysis.primaryLanguages,
    frameworks: jdAnalysis.frameworks,
  });

  const anthropic = makeAnthropicClient(req.headers.get("x-anthropic-key"));
  const tavilyKey = req.headers.get("x-tavily-key");

  try {
    // Two parallel Tavily queries per company, then one batched Claude call
    const companyContexts = await mapWithConcurrency(companies, 3, async (company) => {
      const role = company.role || "engineer";
      const startYear = company.startDate.slice(0, 4);
      const endYear = /^present$/i.test(company.endDate.trim())
        ? new Date().getFullYear().toString()
        : company.endDate.slice(0, 4);
      const blogDomain = engineeringDomain(company.name);

      // Query A: role-focused (who worked there and what they built)
      // Query B: engineering blog / tech stack (high-quality technical content)
      const [roleResults, techResults] = await Promise.all([
        tavilySearch(
          `"${company.name}" "${role}" engineering team ${startYear} ${endYear}`,
          4, tavilyKey
        ),
        tavilySearch(
          `${company.name} engineering teams tech stack ${startYear} ${endYear}`,
          4, tavilyKey,
          blogDomain ? [blogDomain] : undefined
        ),
      ]);

      const merged = dedupeResults([...roleResults, ...techResults]).slice(0, 6);
      const ctx = merged.map((r) => `${r.title}\n${r.content}`).join("\n---\n");
      return { company, role, ctx: ctx.slice(0, 2000) };
    });

    const combinedContext = companyContexts
      .map(({ company, role, ctx }) => {
        const typeHint = isBigTech(company.name)
          ? "[Large tech company — name a specific sub-org or team]"
          : "[Smaller/mid-size company — name a product area or function]";
        return `=== ${company.name} (${company.startDate}–${company.endDate}) | Role: ${role} | ${typeHint} ===\n${ctx}`;
      })
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: MODELS.FAST,
      max_tokens: Math.max(512, companies.length * 350),
      messages: [
        {
          role: "user",
          content: `For each company below, identify the ONE engineering team or area that best matches both the candidate's role at that company AND the JD requirements.

Guidelines:
- Large tech companies (Google, Meta, Amazon, Apple, Microsoft, etc.): name a specific sub-org (e.g. "Core ML", "Ads Ranking", "Compute Infrastructure", "Payments")
- Mid-size / smaller companies: name the product area (e.g. "Payments Platform", "Growth Engineering", "Data Platform")
- Startups: describe what the engineering team built (e.g. "Backend Infrastructure", "ML Platform")
- Match the candidate's role (shown in each header) AND the JD requirements

JD requirements: ${jdSummary}

${combinedContext}

Return ONLY valid JSON with one entry per company (${companies.map((c) => c.name).join(", ")}):
{
  "CompanyName": {
    "selectedTeam": "team or area name",
    "reason": "one sentence: why this matches the candidate role and JD",
    "allDivisions": ["other known teams or areas at this company"]
  }
}`,
        },
      ],
    });

    const claudeCost = calcClaudeCost(MODELS.FAST, response.usage as { input_tokens: number; output_tokens: number });
    const text = (response.content[0] as { type: string; text: string }).text;

    const selections: Record<string, { selectedTeam: string; reason: string }> = {};
    try {
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      for (const company of companies) {
        const sel = parsed[company.name];
        if (sel?.selectedTeam) {
          selections[company.name] = { selectedTeam: sel.selectedTeam, reason: sel.reason ?? "" };
        } else {
          const fb = teamFallback(company.role);
          console.warn("[overview-and-select] missing selection for", company.name, "— fallback:", fb);
          selections[company.name] = { selectedTeam: fb, reason: "role-based fallback" };
        }
      }
    } catch {
      console.warn("[overview-and-select] full parse failed — role-based fallback for all");
      for (const company of companies) {
        selections[company.name] = { selectedTeam: teamFallback(company.role), reason: "parse error fallback" };
      }
    }

    return NextResponse.json({ selections, claudeCost });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
