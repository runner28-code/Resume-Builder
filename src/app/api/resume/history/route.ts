import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const rawOffset = parseInt(searchParams.get("offset") ?? "", 10);
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  const q = (searchParams.get("q") ?? "").trim();

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        candidateName: string;
        jdText: string;
        jdIndustry: string | null;
        companiesJson: string;
        resumeContent: string;
        createdAt: Date;
      }>
    >`
      SELECT
        id,
        "candidateName",
        LEFT("jdText", 400) AS "jdText",
        "jdIndustry",
        "companiesJson"::text,
        jsonb_build_object(
          'summary',        "resumeContent"->'summary',
          'workExperience', "resumeContent"->'workExperience',
          'skills',         "resumeContent"->'skills',
          'education',      "resumeContent"->'education',
          'contactInfo',    "resumeContent"->>'contactInfo',
          'targetCompany',  "resumeContent"->>'targetCompany'
        )::text AS "resumeContent",
        "createdAt"
      FROM "Resume"
      WHERE "userId" = ${sessionUser.userId}
      AND (
        ${q} = ''
        OR lower("resumeContent"->>'targetCompany') LIKE ${'%' + q.toLowerCase() + '%'}
        OR lower("candidateName") LIKE ${'%' + q.toLowerCase() + '%'}
      )
      ORDER BY "createdAt" DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `;

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const resumes = page.map((r) => ({
      id: r.id,
      candidateName: r.candidateName,
      jdPreview: r.jdText.replace(/\s+/g, " ").trim(),
      jdIndustry: r.jdIndustry,
      companies: (JSON.parse(r.companiesJson) as Array<{ name: string; role?: string; startDate: string; endDate: string }>).map((c) => c.name),
      resumeContent: JSON.parse(r.resumeContent) as Record<string, string>,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ resumes, hasMore });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
