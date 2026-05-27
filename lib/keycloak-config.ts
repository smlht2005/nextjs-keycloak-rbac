function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export const keycloakConfig = {
  url: requireEnv("KEYCLOAK_URL"),
  // Server-side internal URL (avoids DNS issues in Docker/Codespaces)
  internalUrl: process.env.KEYCLOAK_INTERNAL_URL || requireEnv("KEYCLOAK_URL"),
  realm: requireEnv("KEYCLOAK_REALM"),
  clientId: requireEnv("KEYCLOAK_CLIENT_ID"),
  clientSecret: requireEnv("KEYCLOAK_CLIENT_SECRET"),
  redirectUri: `${requireEnv("NEXTJS_URL")}/api/auth/callback`,
};
// Browser-facing URLs (use public URL so the user's browser can reach Keycloak)
const publicBase = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect`;
// Server-side URLs (use internal URL for token exchange, JWKS, etc.)
const internalBase = `${keycloakConfig.internalUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect`;
export const keycloakUrls = {
  authEndpoint: `${publicBase}/auth`,
  tokenEndpoint: `${internalBase}/token`,
  logoutEndpoint: `${publicBase}/logout`,
  jwksUri: `${internalBase}/certs`,
  userInfoEndpoint: `${internalBase}/userinfo`,
  issuer: `${keycloakConfig.url}/realms/${keycloakConfig.realm}`,
};
