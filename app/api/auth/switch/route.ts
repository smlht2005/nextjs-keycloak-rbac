import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteSession } from "@/lib/keycloak-admin";

export const dynamic = "force-dynamic";

function extractSessionId(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    // Keycloak stores the SSO session ID in the `sid` claim
    return (decoded.sid as string) ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  const accessToken = session.accessToken;
  await session.destroy();

  // Delete Keycloak SSO session server-side via Admin API.
  // This avoids the front-channel logout confirmation page entirely.
  if (accessToken) {
    const sid = extractSessionId(accessToken);
    if (sid) {
      deleteSession(sid).catch(() => {});
    }
  }

  const appBase =
    process.env.NEXTJS_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.hostname}`;
  return NextResponse.redirect(`${appBase}/api/auth/login`);
}
