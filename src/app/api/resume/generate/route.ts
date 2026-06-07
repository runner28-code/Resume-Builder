import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { makeAnthropicClient, MODELS } from "@/lib/anthropic";
import { MASTER_PROMPT, ADAPT_SYSTEM_PROMPT } from "@/lib/master-prompt";
import { embedJD } from "@/lib/embeddings";
import { calcClaudeCost } from "@/lib/cost";
import { getSessionUser } from "@/lib/session";
import { isRoleHeader, isMetaLine, isDivider } from "@/lib/resume-format";

const CompanySchema = z.object({
  name: z.string().min(1),
  role: z.string().default(""),
  startDate: z.string(),
  endDate: z.string(),
});

const TeamSelectionSchema = z.object({
  selectedTeam: z.string(),
  reason: z.string(),
});

const ReusePlanSchema = z.object({
  path: z.enum(["A", "B", "C"]),
  label: z.string(),
  estimatedCost: z.string(),
  estimatedTime: z.string(),
  referenceResume: z.unknown().nullable(),
  skipCompanyOverview: z.boolean(),
  skipTeamResearch: z.boolean(),
  reuseMode: z.enum(["adapt", "reference", "none"]),
});

const Schema = z.object({
  candidateName: z.string().min(1),
  contactInfo: z.string().optional().default(""),
  targetJD: z.string().min(1),
  companies: z.array(CompanySchema),
  teamSelections: z.record(z.string(), TeamSelectionSchema),
  teamResearch: z.record(z.string(), z.unknown()),
  jdAnalysis: z.record(z.string(), z.unknown()),
  education: z.string(),
  sessionId: z.string(),
  reusePlan: ReusePlanSchema,
  referenceResume: z.unknown().nullable(),
  jdEmbedding: z.array(z.number()).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  const {
    candidateName, contactInfo, targetJD, companies, teamSelections, teamResearch,
    jdAnalysis, education, sessionId, reusePlan, referenceResume, jdEmbedding: preEmbedding,
  } = result.data;

  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const anthropic = makeAnthropicClient(req.headers.get("x-anthropic-key"));
  const voyageKey = req.headers.get("x-voyage-key");

  const isPathA = reusePlan.path === "A";
  const model = reusePlan.path === "C" ? MODELS.SMART : MODELS.FAST;
  const maxTokens = reusePlan.path === "A" ? 2000 : reusePlan.path === "B" ? 3000 : 4000;

  const messages: MessageParam[] = isPathA
    ? [{ role: "user", content: buildAdaptPrompt({ candidateName, targetJD, jdAnalysis, referenceResume, education }) }]
    : buildFullMessages({ candidateName, targetJD, companies, teamSelections, teamResearch, jdAnalysis, education, referenceResume });

  const systemPrompt = isPathA ? ADAPT_SYSTEM_PROMPT : MASTER_PROMPT;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let resumeText = "";

        const anthropicStream = anthropic.messages.stream({
          model,
          max_tokens: maxTokens,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            resumeText += event.delta.text;
            controller.enqueue(encoder.encode(JSON.stringify({ t: event.delta.text }) + "\n"));
          }
        }

        const final = await anthropicStream.finalMessage();
        const usage = final.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
        const generateCost = calcClaudeCost(model, usage);
        console.log("[PATH %s] tokens: in=%d out=%d cached=%d cost=$%s",
          reusePlan.path, usage.input_tokens, usage.output_tokens,
          usage.cache_read_input_tokens ?? 0, generateCost.toFixed(4));

        const workSection = extractSection(resumeText, "WORK EXPERIENCE", "SKILLS");
        const bulletsByRole = extractBulletsByRole(workSection, teamSelections);

        const jdEmbedding = isPathA
          ? []
          : (preEmbedding && preEmbedding.length > 0 ? preEmbedding : await embedJD(targetJD, voyageKey));
        if (!isPathA && jdEmbedding.length === 0) {
          console.warn("[generate] Voyage embedding returned empty — resume will be stored without vector");
        }

        const jdIndustry = (jdAnalysis as { targetIndustry?: string }).targetIndustry ?? null;
        const targetCompany = (jdAnalysis as { targetCompany?: string }).targetCompany ?? null;
        const jdKeywords = (jdAnalysis as { topKeywords?: string[] }).topKeywords ?? [];
        const researchKeys = Object.entries(teamSelections).map(([c, sel]) => `${c}::${sel.selectedTeam}`);
        const resumeData = { ...parseResumeOutput(resumeText), candidateName, contactInfo, targetCompany };

        controller.enqueue(encoder.encode(JSON.stringify({
          done: true,
          resume: resumeData,
          draftMeta: { sessionId, candidateName, contactInfo, jdText: targetJD, jdEmbedding, jdKeywords, jdIndustry, targetCompany, companies, teamSelections, researchKeys, bulletsByRole },
          claudeCost: generateCost,
        }) + "\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: String(err) }) + "\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// ── PATH A: adapt existing resume ─────────────────────────────────────────
function buildAdaptPrompt(data: {
  candidateName: string;
  targetJD: string;
  jdAnalysis: Record<string, unknown>;
  referenceResume: unknown;
  education: string;
}): string {
  const ref = data.referenceResume as {
    resumeContent?: { summary?: string; workExperience?: string; skills?: string };
  } | null;

  return `You have a reference resume below generated for a very similar JD.
ADAPT it (don't rewrite from scratch) for the new JD:
1. Update keyword alignment for new JD terminology
2. Adjust summary for new role's emphasis
3. Re-order/reweight bullets where JD priorities differ
4. Update skills section
Do NOT change company names, dates, or invent new experiences.

NEW JD:
"""
${data.targetJD.slice(0, 3000)}
"""

JD Analysis: ${JSON.stringify(data.jdAnalysis)}

REFERENCE RESUME:
SUMMARY:
${ref?.resumeContent?.summary ?? ""}

WORK EXPERIENCE:
${ref?.resumeContent?.workExperience ?? ""}

SKILLS:
${ref?.resumeContent?.skills ?? ""}

Education: ${data.education}

Output format rules:
- Section headings: SUMMARY / WORK EXPERIENCE / SKILLS / EDUCATION (plain caps, no markdown)
- Each role header: ### Role Title, Company Name
- Each role meta line (dates/location): **dates | location**
- Bullets: plain text lines (no leading dashes)

Output: SUMMARY, WORK EXPERIENCE, SKILLS, EDUCATION`;
}

// Keep only the fields that directly inform bullet writing; drop scale/culture noise
function trimResearch(r: unknown): object {
  const research = r as {
    techStack?: string[];
    keyProjects?: Array<{ name?: string; problem?: string; solution?: string; scale?: string; outcome?: string }>;
    typicalOwnership?: string[];
    hardChallenges?: string[];
    approximateScale?: string;
  };
  return {
    techStack: (research.techStack ?? []).slice(0, 12),
    keyProjects: (research.keyProjects ?? []).slice(0, 3).map(({ name, problem, solution, scale, outcome }) => ({ name, problem, solution, scale, outcome })),
    typicalOwnership: (research.typicalOwnership ?? []).slice(0, 5),
    hardChallenges: (research.hardChallenges ?? []).slice(0, 3),
    ...(research.approximateScale ? { approximateScale: research.approximateScale } : {}),
  };
}

// ── PATH B/C: full generation ─────────────────────────────────────────────
type FullPromptData = {
  candidateName: string;
  targetJD: string;
  companies: Array<{ name: string; role: string; startDate: string; endDate: string }>;
  teamSelections: Record<string, { selectedTeam: string; reason: string }>;
  teamResearch: Record<string, unknown>;
  jdAnalysis: Record<string, unknown>;
  education: string;
  referenceResume: unknown;
};

function buildFullMessages(data: FullPromptData): Array<{ role: "user"; content: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> }> {
  const experienceBlocks = data.companies
    .map((company) => {
      const selection = data.teamSelections[company.name];
      const key = `${company.name}::${selection?.selectedTeam}`;
      const research = trimResearch(data.teamResearch[key] || {});
      return `COMPANY: ${company.name}
ROLE: ${company.role || "Engineer"}
SELECTED TEAM: ${selection?.selectedTeam ?? "unknown"}
PERIOD: ${company.startDate} to ${company.endDate}
RESEARCH: ${JSON.stringify(research)}`;
    })
    .join("\n\n---\n\n");

  const ref = data.referenceResume as { bulletsByRole?: Record<string, string[]> } | null;
  const referenceSection = ref?.bulletsByRole
    ? `\nREFERENCE BULLETS (adapt or improve, do not copy verbatim):
${Object.entries(ref.bulletsByRole)
  .map(([role, bullets]) => `${role}:\n${(bullets as string[]).map((b) => `  - ${b}`).join("\n")}`)
  .join("\n\n")}\n`
    : "";

  const jdBlock = `Generate a complete resume following all master prompt rules.

Candidate Name: ${data.candidateName}
Education: ${data.education}

Target JD:
"""
${data.targetJD.slice(0, 3000)}
"""

JD Analysis: ${JSON.stringify(data.jdAnalysis)}`;

  const researchBlock = `
Work Experience:
${experienceBlocks}
${referenceSection}
Output format rules:
- Section headings: SUMMARY / WORK EXPERIENCE / SKILLS / EDUCATION (plain caps, no markdown)
- Each role header: ### Role Title, Company Name
- Each role meta line (dates/location): **dates | location**
- Bullets: plain text lines (no leading dashes)

Output: SUMMARY, WORK EXPERIENCE, SKILLS, EDUCATION`;

  return [{
    role: "user",
    content: [
      { type: "text", text: jdBlock },
      { type: "text", text: researchBlock },
    ],
  }];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function extractBulletsByRole(
  workExperienceText: string,
  teamSelections: Record<string, { selectedTeam: string }>
): Record<string, string[]> {
  const bulletsByRole: Record<string, string[]> = {};
  for (const [company, sel] of Object.entries(teamSelections)) {
    const key = `${company}::${sel.selectedTeam}`;
    const idx = workExperienceText.indexOf(company);
    if (idx === -1) continue;
    const section = workExperienceText.slice(idx, idx + 2000);
    const bullets = section
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (!t || t.length < 40) return false;
        if (isRoleHeader(t) || isMetaLine(t) || isDivider(t)) return false;
        // Bullets: plain sentences starting with a capital, not ALL-CAPS headings
        return /^[A-Z]/.test(t) && t !== t.toUpperCase();
      })
      .slice(0, 6);
    if (bullets.length > 0) bulletsByRole[key] = bullets;
  }
  return bulletsByRole;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(text: string, heading: string, nextHeading: string | null): string {
  const pattern = new RegExp(
    `(?:^|\\n)[*#\\s]*${escapeRegex(heading)}[*#\\s:-]*(?:\\n|$)`,
    "i"
  );
  const match = pattern.exec(text);
  if (!match) return "";
  const startIdx = match.index + match[0].length;

  if (!nextHeading) return text.slice(startIdx).trim();

  const nextPattern = new RegExp(
    `\\n[*#\\s]*${escapeRegex(nextHeading)}[*#\\s:-]*(?:\\n|$)`,
    "i"
  );
  const nextMatch = nextPattern.exec(text.slice(startIdx));
  return (nextMatch
    ? text.slice(startIdx, startIdx + nextMatch.index)
    : text.slice(startIdx)
  ).trim();
}

function parseResumeOutput(rawText: string) {
  return {
    summary: extractSection(rawText, "SUMMARY", "WORK EXPERIENCE"),
    workExperience: extractSection(rawText, "WORK EXPERIENCE", "SKILLS"),
    skills: extractSection(rawText, "SKILLS", "EDUCATION"),
    education: extractSection(rawText, "EDUCATION", null),
    rawText,
  };
}
