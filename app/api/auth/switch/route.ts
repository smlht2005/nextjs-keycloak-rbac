import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { keycloakConfig, keycloakUrls } from "@/lib/keycloak-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Destroy app session and revoke refresh token (backchannel)
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const refreshToken = session.refreshToken;
  await session.destroy();

  if (refreshToken) {
    fetch(keycloakUrls.logoutEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }

  // 2. Front-channel logout: redirect browser to Keycloak to clear SSO session
  // After Keycloak clears the session, it redirects back to /api/auth/login
  const appBase = process.env.NEXTJS_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.hostname}`;
  const params = new URLSearchParams({
    client_id: keycloakConfig.clientId,
    post_logout_redirect_uri: `${appBase}/api/auth/login`,
  });

  return NextResponse.redirect(`${keycloakUrls.logoutEndpoint}?${params}`);
}
