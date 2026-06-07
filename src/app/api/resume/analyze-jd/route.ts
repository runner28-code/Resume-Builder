import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { makeAnthropicClient, MODELS } from "@/lib/anthropic";
import { calcClaudeCost } from "@/lib/cost";
import { getSessionUser } from "@/lib/session";
import { hashJD, getAnalysisCache, setAnalysisCache } from "@/lib/jd-analysis-cache";

const Schema = z.object({
  jobDescription: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  const { jobDescription } = result.data;
  if (!await getSessionUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jdHash = hashJD(jobDescription);
  const cached = await getAnalysisCache(jdHash);
  if (cached) {
    console.log("[analyze-jd] cache hit");
    return NextResponse.json({ analysis: cached.analysis, claudeCost: 0 });
  }

  const anthropic = makeAnthropicClient(req.headers.get("x-anthropic-key"));

  try {
    const response = await anthropic.messages.create({
      model: MODELS.FAST,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze this job description and extract structured data. Return ONLY valid JSON with no markdown.

Schema:
{
  "targetCompany": "exact company name from the JD",
  "targetIndustry": "fintech|adtech|healthtech|saas|enterprise|other",
  "companyType": "startup|bigtech|consulting|enterprise",
  "topKeywords": ["keyword1", "keyword2", ...], // top 15 ATS keywords
  "hardRequirements": ["skill1", ...],
  "softRequirements": ["trait1", ...],
  "cloudPlatform": "AWS|GCP|Azure|null",
  "primaryLanguages": ["Python", ...],
  "frameworks": ["React", ...],
  "experienceYears": 3
}

JD:
"""
${jobDescription.slice(0, 6000)}
"""`,
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text;
    let analysis: object;
    try {
      analysis = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      try { analysis = match ? JSON.parse(match[0]) : {}; }
      catch { analysis = {}; }
    }

    const claudeCost = calcClaudeCost(MODELS.FAST, response.usage as { input_tokens: number; output_tokens: number });
    if (Object.keys(analysis).length > 0) await setAnalysisCache(jdHash, { analysis, claudeCost });
    return NextResponse.json({ analysis, claudeCost });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
