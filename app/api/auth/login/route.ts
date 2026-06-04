import { NextResponse } from "next/server";
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
  const params = new URLSearchParams({
    response_type: "code",
    client_id: keycloakConfig.clientId,
    redirect_uri: keycloakConfig.redirectUri,
    scope: "openid",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login",
  });
  const redirectUrl = `${keycloakUrls.authEndpoint}?${params}`;
  // Write the session cookie directly onto the redirect Response so that
  // Set-Cookie is guaranteed to be present (cookies() from next/headers is NOT
  // merged into NextResponse.redirect() headers in Next.js 14).
  const response = NextResponse.redirect(redirectUrl);
  const session = await getIronSession<SessionData>(
    response.cookies,
    sessionOptions,
  );
  session.codeVerifier = codeVerifier;
  session.state = state;
  await session.save();
  console.log(
    `[login] session cookie written to redirect response | state=${state}`,
  );
  return response;
}
