import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { embedJDBatch } from "@/lib/embeddings";
import { getSessionUser } from "@/lib/session";

const Schema = z.object({
  jdTexts: z.array(z.string().min(1)).min(1).max(10),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  if (!await getSessionUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const voyageKey = req.headers.get("x-voyage-key");
  const embeddings = await embedJDBatch(result.data.jdTexts, voyageKey);
  const failed = embeddings.some((e) => e.length === 0);
  return NextResponse.json({ embeddings, ...(failed ? { warning: "one or more embeddings failed" } : {}) });
}
