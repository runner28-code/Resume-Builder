import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE } from "@/lib/session-cookie";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET env var is not set — set it before starting the server");
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters — use a strong random value");
}

// Short-lived cache so repeated API calls within the same session don't each
// hit the DB to verify the userId still exists.
const _userExistsCache = new Map<string, number>(); // userId → cachedAt ms
const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_MAX = 1000;

async function checkUserExists(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = _userExistsCache.get(userId);
  if (cached !== undefined) {
    if (now - cached < USER_CACHE_TTL_MS) return true;
    _userExistsCache.delete(userId); // evict expired entry eagerly
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User" WHERE id = ${userId} LIMIT 1
    `;
    if (rows.length > 0) {
      if (_userExistsCache.size >= USER_CACHE_MAX) {
        const oldest = _userExistsCache.keys().next().value;
        if (oldest !== undefined) _userExistsCache.delete(oldest);
      }
      _userExistsCache.set(userId, now);
      return true;
    }
    return false;
  } catch (err) {
    console.error("[session] checkUserExists DB error — denying access:", String(err));
    return false;
  }
}

const COOKIE = SESSION_COOKIE;
const EXPIRY_DAYS = 7;

interface SessionPayload {
  userId: string;
  email: string;
}

function secretKey() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is not set");
  return new TextEncoder().encode(s);
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_DAYS}d`)
    .sign(secretKey());
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, email: string): Promise<void> {
  const token = await encrypt({ userId, email });
  const expires = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false,
    expires,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Use in Server Components / Server Actions — redirects to /login if not authenticated. */
export async function verifySession(): Promise<{ userId: string; email: string }> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  const payload = token ? await decrypt(token) : null;
  if (!payload?.userId) redirect("/login");
  if (!await checkUserExists(payload.userId)) redirect("/login");
  return { userId: payload.userId, email: payload.email };
}

/** Non-redirecting version for API route handlers. */
export async function getSessionUser(): Promise<{ userId: string; email: string } | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const payload = await decrypt(token);
  if (!payload?.userId) return null;
  if (!await checkUserExists(payload.userId)) return null;
  return { userId: payload.userId, email: payload.email };
}
