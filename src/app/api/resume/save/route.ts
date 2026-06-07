import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const DraftMetaSchema = z.object({
  sessionId: z.string(),
  candidateName: z.string(),
  contactInfo: z.string(),
  jdText: z.string(),
  jdEmbedding: z.array(z.number()).refine((a) => a.length === 0 || a.length === 512, {
    message: "jdEmbedding must be empty or 512-dimensional (voyage-3-lite)",
  }),
  jdKeywords: z.array(z.string()),
  jdIndustry: z.string().nullable(),
  targetCompany: z.string().nullable(),
  companies: z.array(z.object({
    name: z.string(),
    role: z.string(),
    startDate: z.string(),
    endDate: z.string(),
  })),
  teamSelections: z.record(z.string(), z.object({
    selectedTeam: z.string(),
    reason: z.string(),
  })),
  researchKeys: z.array(z.string()),
  bulletsByRole: z.record(z.string(), z.array(z.string())),
});

const ResumeDataSchema = z.object({
  summary: z.string(),
  workExperience: z.string(),
  skills: z.string(),
  education: z.string(),
  rawText: z.string(),
  candidateName: z.string(),
  contactInfo: z.string(),
  targetCompany: z.string().nullable(),
});

const Schema = z.object({
  resumeData: ResumeDataSchema,
  draftMeta: DraftMetaSchema,
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  const { resumeData, draftMeta } = result.data;

  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = sessionUser;
  const {
    sessionId, candidateName, contactInfo, jdText, jdEmbedding, jdKeywords,
    jdIndustry, targetCompany, companies, teamSelections, researchKeys, bulletsByRole,
  } = draftMeta;

  const embeddingValue = jdEmbedding.length > 0
    ? Prisma.sql`${JSON.stringify(jdEmbedding)}::vector`
    : Prisma.sql`NULL`;

  // Store edited content (strip rawText; candidateName lives in its own column)
  const { rawText: _raw, candidateName: _cn, ...contentToStore } = resumeData;
  const resumeContent = { ...contentToStore, contactInfo, targetCompany };

  const newId = randomUUID();

  try {
    const saved = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Resume" (
        id, "userId", "sessionId", "candidateName", "jdText", "jdEmbedding",
        "jdKeywords", "jdIndustry", "companiesJson", "teamSelectionsJson",
        "teamResearchKeys", "resumeContent", "bulletsByRole",
        "createdAt"
      ) VALUES (
        ${newId},
        ${userId},
        ${sessionId},
        ${candidateName},
        ${jdText},
        ${embeddingValue},
        ${jdKeywords}::text[],
        ${jdIndustry},
        ${JSON.stringify(companies)}::jsonb,
        ${JSON.stringify(teamSelections)}::jsonb,
        ${researchKeys}::text[],
        ${JSON.stringify(resumeContent)}::jsonb,
        ${JSON.stringify(bulletsByRole)}::jsonb,
        NOW()
      )
      RETURNING id
    `;

    if (!saved[0]) throw new Error("Resume INSERT returned no rows");
    return NextResponse.json({ resumeId: saved[0].id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
