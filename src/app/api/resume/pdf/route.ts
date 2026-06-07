import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  renderToBuffer, Document, Page, Text, View, StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { stripMd, isDivider } from "@/lib/resume-format";
import { parseWorkExperience } from "@/lib/work-experience-parser";

// ── Palette ───────────────────────────────────────────────────────────────
const C = {
  heading:  "#1e3a5f",   // dark navy for section titles & underlines
  company:  "#2563eb",   // blue for company names
  body:     "#111827",   // near-black for body text
  muted:    "#6b7280",   // grey for dates / meta
  intro:    "#374151",   // dark grey for italic intro descriptions
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 50,
    color: C.body,
    lineHeight: 1.5,
  },

  // ── Header (centered) ───────────────────────────────────────────────────
  header: {
    alignItems: "center",
    marginBottom: 12,
  },
  name: {
    fontSize: 26,
    fontWeight: "bold",
    color: C.body,
    letterSpacing: 0.5,
    marginBottom: 15,
    textAlign: "center",
  },
  contact: {
    fontSize: 9,
    color: C.muted,
    textAlign: "center",
    letterSpacing: 0.1,
  },

  // ── Section title ────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: C.heading,
    borderBottomWidth: 1,
    borderBottomColor: C.heading,
    borderBottomStyle: "solid",
    paddingBottom: 2,
    marginTop: 12,
    marginBottom: 6,
  },

  // ── Work experience ──────────────────────────────────────────────────────
  roleBlock: { marginBottom: 9 },
  roleTitle: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: C.body,
    marginBottom: 2,
  },
  companyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  companyName: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.company,
  },
  roleDates: {
    fontSize: 9,
    color: C.muted,
    fontStyle: "italic",
  },
  roleIntro: {
    fontSize: 9.5,
    fontStyle: "italic",
    marginBottom: 4,
    lineHeight: 1.5,
    color: C.intro,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 2.5,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 10,
    color: C.body,
    marginTop: 0.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 1.5,
  },

  // ── Skills ───────────────────────────────────────────────────────────────
  skillLine: {
    fontSize: 9.5,
    lineHeight: 1.55,
    marginBottom: 3,
  },
  skillLabelInline: {
    fontWeight: "bold",
  },

  // ── Summary / Education ──────────────────────────────────────────────────
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.6,
    marginBottom: 3,
  },
  eduBold: {
    fontSize: 9.5,
    fontWeight: "bold",
    marginBottom: 1,
  },
});

// ── Section renderers ──────────────────────────────────────────────────────

function Summary({ text }: { text: string }) {
  const clean = text.replace(/---+/g, "").replace(/\*\*/g, "").trim();
  if (!clean) return null;
  return React.createElement(Text, { style: styles.paragraph }, clean);
}

function WorkExperience({ text }: { text: string }) {
  const roles = parseWorkExperience(text);
  const blocks = roles.map((role, ri) => {
    const children: React.ReactElement[] = [];

    children.push(React.createElement(Text, { key: `rt${ri}`, style: styles.roleTitle }, role.title));

    if (role.companyName && role.dates) {
      children.push(
        React.createElement(
          View, { key: `cr${ri}`, style: styles.companyRow },
          React.createElement(Text, { style: styles.companyName }, role.companyName),
          React.createElement(Text, { style: styles.roleDates }, role.dates)
        )
      );
    } else if (role.companyName) {
      children.push(React.createElement(Text, { key: `cn${ri}`, style: styles.companyName }, role.companyName));
    } else if (role.dates) {
      children.push(React.createElement(Text, { key: `m${ri}`, style: styles.roleDates }, role.dates));
    }

    if (role.intro) {
      children.push(React.createElement(Text, { key: `intro${ri}`, style: styles.roleIntro }, role.intro));
    }

    role.bullets.forEach((bullet, bi) => {
      children.push(
        React.createElement(
          View, { key: `b${ri}_${bi}`, style: styles.bulletRow },
          React.createElement(Text, { style: styles.bulletDot }, "•"),
          React.createElement(Text, { style: styles.bulletText }, bullet)
        )
      );
    });

    return React.createElement(View, { key: ri, style: styles.roleBlock }, ...children);
  });

  return React.createElement(React.Fragment, null, ...blocks);
}

function Skills({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !isDivider(l));
  return React.createElement(
    React.Fragment,
    null,
    ...lines.map((line, i) => {
      // **Label:** value  →  bold "Label: " inline with normal value text
      const m = line.match(/^\*\*([^*]+?):\*?\*\s*(.*)/);
      if (m) {
        return React.createElement(
          Text, { key: i, style: styles.skillLine },
          React.createElement(Text, { style: styles.skillLabelInline }, m[1] + ": "),
          m[2]
        );
      }
      return React.createElement(Text, { key: i, style: styles.paragraph }, stripMd(line));
    })
  );
}

function Education({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !isDivider(l));
  return React.createElement(
    React.Fragment,
    null,
    ...lines.map((line, i) => {
      const isBold = /^\*\*[^*]+\*\*$/.test(line);
      return React.createElement(
        Text,
        { key: i, style: isBold ? styles.eduBold : styles.paragraph },
        stripMd(line)
      );
    })
  );
}

// ── Schema & route ─────────────────────────────────────────────────────────

const Schema = z.object({
  resumeId: z.string(),
});

function el<P extends object>(type: React.ElementType, props: P, ...children: React.ReactNode[]) {
  return React.createElement(type, props, ...children);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = Schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }
  const { resumeId } = result.data;

  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch saved resume — enforce ownership so users can't download others' resumes
  const rows = await prisma.$queryRaw<Array<{ candidateName: string; resumeContent: unknown }>>`
    SELECT "candidateName", "resumeContent"
    FROM "Resume"
    WHERE id = ${resumeId} AND "userId" = ${sessionUser.userId}
    LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { candidateName, resumeContent } = rows[0];
  const rc = resumeContent as {
    summary?: string; workExperience?: string; skills?: string;
    education?: string; contactInfo?: string; targetCompany?: string;
  };

  const resume = {
    summary:        rc.summary        ?? "",
    workExperience: rc.workExperience ?? "",
    skills:         rc.skills         ?? "",
    education:      rc.education      ?? "",
  };
  const contactInfo  = rc.contactInfo  ?? "";
  const targetCompany = rc.targetCompany ?? "";

  try {
    const doc = el(
      Document, {},
      el(Page, { size: "LETTER", style: styles.page },
        el(View, { style: styles.header },
          el(Text, { style: styles.name }, candidateName),
          contactInfo ? el(Text, { style: styles.contact }, contactInfo) : null,
        ),

        el(Text, { style: styles.sectionTitle }, "Summary"),
        el(Summary, { text: resume.summary }),

        el(Text, { style: styles.sectionTitle }, "Work Experience"),
        el(WorkExperience, { text: resume.workExperience }),

        el(Text, { style: styles.sectionTitle }, "Skills"),
        el(Skills, { text: resume.skills }),

        el(Text, { style: styles.sectionTitle }, "Education"),
        el(Education, { text: resume.education }),
      )
    );

    const buffer = await renderToBuffer(doc);
    const fileBase = targetCompany || candidateName;

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileBase + "_resume.pdf")}`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
