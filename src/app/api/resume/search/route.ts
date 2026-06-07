import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findSimilarResumes } from "@/lib/resume-search";
import { decideReusePath } from "@/lib/reuse-strategy";
import { getSessionUser } from "@/lib/session";

const Schema = z.object({
  jdText: z.string().min(1),
  companyNames: z.array(z.string()),
  jdEmbedding: z.array(z.number()).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  const { jdText, companyNames, jdEmbedding } = result.data;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { results, voyageCost } = await findSimilarResumes(
      jdText, companyNames, 5,
      req.headers.get("x-voyage-key"),
      sessionUser.userId,
      jdEmbedding
    );
    const plan = decideReusePath(results, companyNames);

    return NextResponse.json({
      plan,
      topMatches: results.slice(0, 3).map((m) => ({
        resumeId: m.resumeId,
        similarity: Math.round(m.similarity * 100),
        jdIndustry: m.jdIndustry,
      })),
      claudeCost: voyageCost,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
