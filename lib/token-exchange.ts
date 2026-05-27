import { keycloakConfig, keycloakUrls } from './keycloak-config'
export interface TokenResponse {
  access_token: string; refresh_token: string; id_token: string; expires_in: number; token_type: string
}
// AbortSignal.timeout() must be created per-request, NOT as a module-level constant.
// A module-level signal fires once (5s after import) and stays aborted forever.
const fetchOpts = () => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(5000) })

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'authorization_code', client_id: keycloakConfig.clientId, client_secret: keycloakConfig.clientSecret, code, redirect_uri: keycloakConfig.redirectUri, code_verifier: codeVerifier })
  const res = await fetch(keycloakUrls.tokenEndpoint, { ...fetchOpts(), body: params.toString() })
  if (!res.ok) throw new Error(`Token exchange failed [${res.status}]`)
  return res.json() as Promise<TokenResponse>
}
export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'refresh_token', client_id: keycloakConfig.clientId, client_secret: keycloakConfig.clientSecret, refresh_token: refreshToken })
  const res = await fetch(keycloakUrls.tokenEndpoint, { ...fetchOpts(), body: params.toString() })
  if (!res.ok) throw new Error(`Token refresh failed [${res.status}]`)
  return res.json() as Promise<TokenResponse>
}
