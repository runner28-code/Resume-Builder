import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const Schema = z.object({ resumeId: z.string().min(1) });

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 });

  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deleted = await prisma.$executeRaw`
    DELETE FROM "Resume"
    WHERE id = ${result.data.resumeId}
      AND "userId" = ${sessionUser.userId}
  `;

  if (deleted === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
