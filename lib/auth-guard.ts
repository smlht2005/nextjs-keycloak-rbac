import { redirect } from 'next/navigation'
import { getSession } from './session'
import { verifyAccessToken, KeycloakJWTPayload } from './jwt-verify'
import { refreshTokens } from './token-exchange'
import type { AppRole } from '@/types/auth'

export interface AuthContext {
  accessToken: string
  payload:     KeycloakJWTPayload
  roles:       AppRole[]
  username:    string
  email:       string
  fullName:    string
}

export async function requireAuth(): Promise<AuthContext> {
  const session = await getSession()
  if (!session.accessToken) redirect('/api/auth/login')
  const now = Math.floor(Date.now() / 1000)
  if (session.expiresAt && session.expiresAt < now + 60) {
    if (!session.refreshToken) { await session.destroy(); redirect('/api/auth/login') }
    try {
      const tokens = await refreshTokens(session.refreshToken)
      // Verify the new token before trusting it
      await verifyAccessToken(tokens.access_token)
      session.accessToken = tokens.access_token; session.refreshToken = tokens.refresh_token
      session.expiresAt = now + tokens.expires_in; await session.save()
    } catch (err) {
      console.error('[auth-guard] token refresh failed:', err instanceof Error ? err.message : err)
      await session.destroy(); redirect('/api/auth/login')
    }
  }
  let payload: KeycloakJWTPayload
  try { payload = await verifyAccessToken(session.accessToken) }
  catch (err) {
    console.error('[auth-guard] token verify failed:', err instanceof Error ? err.message : err)
    await session.destroy(); redirect('/api/auth/login')
  }
  const roles = (payload!.realm_access?.roles ?? []) as AppRole[]
  return {
    accessToken: session.accessToken,
    payload: payload!,
    roles,
    username: payload!.preferred_username ?? '',
    email:    payload!.email ?? '',
    fullName: payload!.name ?? '',
  }
}

export async function requireRoles(allowedRoles: AppRole[]): Promise<AuthContext> {
  const ctx = await requireAuth()
  if (!allowedRoles.some(r => ctx.roles.includes(r))) redirect('/unauthorized')
  return ctx
}
