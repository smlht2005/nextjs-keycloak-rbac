import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";

export const dynamic = "force-dynamic";
import { sessionOptions, type SessionData } from "@/lib/session";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "@/lib/pkce";
import { keycloakConfig, keycloakUrls } from "@/lib/keycloak-config";
export async function GET(req: Request) {
  console.log(`[login] GET /api/auth/login called`);
  console.log(`[login] redirectUri = ${keycloakConfig.redirectUri}`);
  console.log(`[login] keycloakAuthEndpoint = ${keycloakUrls.authEndpoint}`);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const url = new URL(req.url);
  const forceLogin = url.searchParams.get("switch") === "true";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: keycloakConfig.clientId,
    redirect_uri: keycloakConfig.redirectUri,
    scope: "openid",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...(forceLogin && { prompt: "login" }),
  });
  const redirectUrl = `${keycloakUrls.authEndpoint}?${params}`;

  // In Next.js 16, cookies() from next/headers is automatically merged into
  // the response (including redirect responses). The previous workaround of
  // passing response.cookies to getIronSession() no longer sets Set-Cookie.
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  session.codeVerifier = codeVerifier;
  session.state = state;
  await session.save();
  console.log(
    `[login] session cookie written | state=${state}`,
  );
  return NextResponse.redirect(redirectUrl);
}
