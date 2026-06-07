"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";

// Simple in-process rate limiter (per server process — sufficient for single-instance deploys)
const _rl = new Map<string, { count: number; resetAt: number }>();
const RL_MAX_ENTRIES = 10_000;

function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = _rl.get(key);
  if (!entry || now > entry.resetAt) {
    // Evict the oldest entry if the map is at capacity
    if (!entry && _rl.size >= RL_MAX_ENTRIES) {
      const oldest = _rl.keys().next().value;
      if (oldest !== undefined) _rl.delete(oldest);
    }
    _rl.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (entry.count >= max) return true;
  entry.count++;
  return false;
}

async function clientIP(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const SignupSchema = z.object({
  email: z.string().check(z.email("Valid email required")).trim(),
  password: z
    .string()
    .min(8, "Must be at least 8 characters")
    .check(z.regex(/[A-Za-z]/, "Must contain a letter"))
    .check(z.regex(/[0-9]/, "Must contain a number")),
});

const LoginSchema = z.object({
  email: z.string().check(z.email()).trim(),
  password: z.string().min(1),
});

export type AuthState =
  | { errors?: { email?: string[]; password?: string[] }; message?: string }
  | undefined;

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await clientIP();
  if (rateLimited(`signup:${ip}`, 10, 60 * 60 * 1000)) {
    return { message: "Too many signups from this IP — try again later" };
  }

  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { email, password } = parsed.data;

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User" WHERE email = ${email} LIMIT 1
  `;
  if (existing.length > 0) {
    return { errors: { email: ["Email already in use"] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "User" (id, email, "passwordHash", "createdAt")
    VALUES (gen_random_uuid()::text, ${email}, ${passwordHash}, NOW())
    RETURNING id
  `;
  if (!rows[0]) return { message: "Failed to create account" };

  await createSession(rows[0].id, email);
  redirect("/");
}

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await clientIP();
  if (rateLimited(`login:${ip}`, 5, 15 * 60 * 1000)) {
    return { message: "Too many attempts — try again in 15 minutes" };
  }

  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { message: "Invalid email or password" };
  }
  const { email, password } = parsed.data;

  const rows = await prisma.$queryRaw<Array<{ id: string; passwordHash: string }>>`
    SELECT id, "passwordHash" FROM "User" WHERE email = ${email} LIMIT 1
  `;
  // Always run bcrypt to prevent timing-based email enumeration
  const hashToCheck = rows[0]?.passwordHash ?? "$2b$12$invalidhashpaddingtomatchbcrypt";
  const valid = await bcrypt.compare(password, hashToCheck);
  if (rows.length === 0 || !valid) {
    return { message: "Invalid email or password" };
  }

  await createSession(rows[0].id, email);
  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
