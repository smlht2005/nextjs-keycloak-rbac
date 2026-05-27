import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { keycloakUrls, keycloakConfig } from '@/lib/keycloak-config'
export async function GET(req: NextRequest) {
  const session = await getSession()
  await session.destroy()
  const params = new URLSearchParams({ client_id: keycloakConfig.clientId, post_logout_redirect_uri: `${process.env.NEXTJS_URL}/login` })
  return NextResponse.redirect(`${keycloakUrls.logoutEndpoint}?${params}`)
}
