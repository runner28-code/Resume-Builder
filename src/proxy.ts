import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// NOTE: the matcher below intentionally excludes /api/* routes — auth for those
// is enforced at the route-handler level via getSessionUser(). Any new API route
// that omits that call will be publicly accessible with no middleware safety net.
const PUBLIC_PATHS = ["/login", "/signup"];

async function getSessionPayload(token: string | undefined) {
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error("[proxy] SESSION_SECRET env var is not set — all sessions are invalid, every request will redirect to /login");
    return null;
  }
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] }
    );
    return payload;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await getSessionPayload(token);
  const isAuthed = !!session?.userId;

  if (!isPublic && !isAuthed) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isPublic && isAuthed) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
