export function stripMd(s: string): string {
  return s
    .replace(/^#{1,3}\s*/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[-•]\s*/, "")
    .trim();
}

export function isRoleHeader(s: string): boolean { return /^#{1,3}\s/.test(s); }
export function isMetaLine(s: string): boolean   { return /^\*\*[^*]+\*\*$/.test(s) || /^\*\*[^*]+(20\d{2}|19\d{2})/.test(s); }
export function isDivider(s: string): boolean    { return /^-{2,}$/.test(s); }
export function isBullet(s: string): boolean     { return /^[-•]/.test(s); }
