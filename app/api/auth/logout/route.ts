import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic';
import { keycloakUrls, keycloakConfig } from '@/lib/keycloak-config'

export async function GET(req: NextRequest) {
  const session = await getSession()
  const refreshToken = session.refreshToken

  // Destroy local session first so the browser is always redirected to /login,
  // regardless of whether the Keycloak backchannel call succeeds.
  await session.destroy()

  // Backchannel logout: revoke the Keycloak session server-side via refresh_token.
  // This terminates the SSO session without relying on Keycloak's redirect behavior,
  // which requires id_token_hint in Keycloak 18+ to work reliably.
  if (refreshToken) {
    fetch(keycloakUrls.tokenEndpoint.replace('/token', '/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => { /* best-effort: don't block redirect on Keycloak error */ })
  }

  const loginUrl = new URL('/login', process.env.NEXTJS_URL ?? req.url)
  return NextResponse.redirect(loginUrl)
}
