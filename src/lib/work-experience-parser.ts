import { stripMd, isRoleHeader, isMetaLine, isDivider, isBullet } from "@/lib/resume-format";

export interface ParsedRole {
  title: string;
  companyName: string | null;
  dates: string | null;
  intro: string | null;
  bullets: string[];
}

export function parseWorkExperience(text: string): ParsedRole[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const roles: ParsedRole[] = [];
  let current: ParsedRole | null = null;

  function flush() {
    if (current) { roles.push(current); current = null; }
  }

  for (const line of lines) {
    if (isDivider(line)) { flush(); continue; }

    if (isRoleHeader(line)) {
      flush();
      const clean = stripMd(line);
      const ci = clean.lastIndexOf(", ");
      current = {
        title: ci > 0 ? clean.slice(0, ci) : clean,
        companyName: ci > 0 ? clean.slice(ci + 2) : null,
        dates: null,
        intro: null,
        bullets: [],
      };
      continue;
    }

    if (isMetaLine(line)) {
      if (current) current.dates = stripMd(line);
      continue;
    }

    const content = stripMd(line);
    if (!content || !current) continue;

    if (current.intro === null && !isBullet(line)) {
      current.intro = content;
    } else {
      current.bullets.push(content);
    }
  }

  flush();
  return roles;
}
