import { NextRequest, NextResponse } from "next/server";
const PUBLIC_PATHS = new Set(["/login", "/unauthorized", "/favicon.ico"]);
const PUBLIC_PREFIX = ["/api/auth/", "/_next/"];
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("hospital_session");
  console.log(
    `[proxy] ${req.method} ${pathname} | session=${hasSession} | cookies=[${[...req.cookies.getAll().map((c) => c.name)].join(",")}]`,
  );
  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIX.some((p) => pathname.startsWith(p))
  ) {
    console.log(`[proxy] PASS (public path): ${pathname}`);
    return NextResponse.next();
  }
  if (!hasSession) {
    console.log(`[proxy] REDIRECT to /api/auth/login (no session cookie)`);
    return NextResponse.redirect(new URL("/api/auth/login", req.url));
  }
  console.log(`[proxy] PASS (session exists): ${pathname}`);
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
