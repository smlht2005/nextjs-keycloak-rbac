import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteSession } from "@/lib/keycloak-admin";

export const dynamic = "force-dynamic";

function extractSessionId(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (decoded.sid as string) ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  const accessToken = session.accessToken;
  await session.destroy();

  // Best-effort: delete the Keycloak SSO session server-side via Admin API.
  // Awaited so the session is cleared before we redirect to Keycloak.
  if (accessToken) {
    const sid = extractSessionId(accessToken);
    if (sid) {
      await deleteSession(sid).catch(() => {});
    }
  }

  // Always use prompt=login as a fallback guarantee:
  // if session deletion failed or there was no app session,
  // Keycloak still shows the login form instead of auto-logging in.
  const appBase =
    process.env.NEXTJS_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.hostname}`;
  return NextResponse.redirect(`${appBase}/api/auth/login?switch=true`);
}
