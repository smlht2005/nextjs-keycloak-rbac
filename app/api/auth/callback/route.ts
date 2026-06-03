import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
import { exchangeCodeForTokens } from "@/lib/token-exchange";
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  console.log(
    `[callback] GET /api/auth/callback | code=${code ? code.slice(0, 8) + "..." : "null"} | state=${state} | error=${error}`,
  );
  console.log(
    `[callback] incoming cookies: [${[...req.cookies.getAll().map((c) => c.name)].join(",")}]`,
  );
  const appBase =
    process.env.NEXTJS_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.hostname}`;
  if (error || !code || !state) {
    console.error(
      `[callback] ABORT: missing params | error=${error} code=${!!code} state=${!!state}`,
    );
    return NextResponse.redirect(new URL("/login", appBase));
  }
  const session = await getSession();
  console.log(
    `[callback] session.state=${session.state} | session.codeVerifier=${session.codeVerifier ? "present" : "MISSING"}`,
  );
  if (state !== session.state || !session.codeVerifier) {
    console.error(
      `[callback] STATE MISMATCH or missing codeVerifier | expected=${session.state} got=${state}`,
    );
    await session.destroy();
    return NextResponse.redirect(new URL("/login", appBase));
  }
  try {
    console.log(`[callback] exchanging code for tokens...`);
    const tokens = await exchangeCodeForTokens(code, session.codeVerifier);
    const now = Math.floor(Date.now() / 1000);
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token;
    // idToken is NOT stored in session to keep cookie size under 4KB browser limit.
    session.expiresAt = now + tokens.expires_in;
    session.codeVerifier = undefined;
    session.state = undefined;
    await session.save();
    console.log(`[callback] SUCCESS: tokens saved, redirecting to /dashboard`);
    return NextResponse.redirect(new URL("/dashboard", appBase));
  } catch (err) {
    console.error(
      "[callback] token exchange error:",
      err instanceof Error ? err.message : String(err),
    );
    await session.destroy();
    return NextResponse.redirect(new URL("/login", appBase));
  }
}
