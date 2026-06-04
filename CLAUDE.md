# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # development server (Next.js hot reload)
npm run build      # production build (standalone output)
npm run start      # production server
npm run lint       # ESLint
npm run audit      # npm audit --audit-level=high
```

No test runner is configured — verify behavior by running the app.

## Architecture Overview

**Pattern: Next.js 14 BFF (Backend-for-Frontend) + Keycloak OIDC/PKCE + iron-session**

The app is a secure proxy layer for hospital microservices. It handles all auth complexity server-side; the browser only ever sees encrypted session cookies.

### Authentication Flow (OIDC PKCE)

```
Browser → /api/auth/login  → generates PKCE verifier+challenge+state → session cookie
       → Keycloak (browser redirect)
       → /api/auth/callback → exchanges code+verifier for tokens → stores in session
       → /dashboard
```

- `lib/pkce.ts` — PKCE code verifier/challenge + state generation
- `lib/token-exchange.ts` — code exchange and refresh token exchange (server-to-server)
- `lib/jwt-verify.ts` — JWKS-based JWT signature verification (jose library, caches public keys)
- `lib/session.ts` — iron-session configuration (cookie name: `hospital_session`, 1-hour TTL)
- `lib/auth-guard.ts` — `requireAuth()` and `requireRoles()` used in Server Components and API routes

### Session & Token Storage

Tokens are stored in iron-session (encrypted httpOnly cookie), never exposed to browser JavaScript. On each protected request:

1. Session cookie decrypted → `accessToken`, `refreshToken`, `expiresAt`
2. If `expiresAt < now + 60s` → auto-refresh using `refreshToken`
3. JWT verified via JWKS (issuer + audience claims checked)
4. `AuthContext` returned to Server Component or API route

### Route Structure

```
app/(auth)/          # Public routes — no auth check
app/(protected)/     # requireAuth() called in layout.tsx
app/api/auth/        # login, callback, logout handlers
app/api/bff/         # Proxy routes to upstream microservices
```

BFF proxy routes (`/api/bff/*`) call `requireRoles()` per HTTP method, then forward requests with `Authorization: Bearer ${accessToken}` to upstream services.

### RBAC

Roles (`admin`, `doctor`, `nurse`, `viewer`) come from JWT claim `realm_access.roles` (set by Keycloak OIDC mapper). Permission mapping is defined in `types/auth.ts` as `ROLE_PERMISSIONS`.

`requireRoles(['admin', 'doctor'])` checks if the user has ANY of the listed roles.

### Dual Keycloak URL Strategy

`KEYCLOAK_URL` — browser-facing (used in redirect URIs shown to user)  
`KEYCLOAK_INTERNAL_URL` — optional, for Docker/K8s internal networking (token endpoint, JWKS endpoint)

This prevents DNS/proxy issues in containerized deployments. When set, `lib/keycloak-config.ts` substitutes the internal URL for all server-side calls.

### Middleware

`middleware.ts` runs on every request. Public paths (`/login`, `/unauthorized`, `/api/auth/*`, `/_next/*`) bypass the session check. All other paths redirect to `/api/auth/login` if no valid session cookie exists.

## Key Environment Variables

See `.env.example` for the full list. Critical ones:

| Variable | Purpose |
|---|---|
| `KEYCLOAK_URL` | Public Keycloak URL (browser redirects) |
| `KEYCLOAK_INTERNAL_URL` | Internal Keycloak URL (server-to-server, optional) |
| `KEYCLOAK_REALM` | Realm name (default: `hospital`) |
| `KEYCLOAK_CLIENT_ID` | Confidential client ID |
| `KEYCLOAK_CLIENT_SECRET` | Client secret from Keycloak admin |
| `SESSION_SECRET` | iron-session encryption key (min 32 chars) |
| `PATIENT_SERVICE_URL` | Upstream microservice base URL |

## Deployment

- Docker: multi-stage build, `next build` with `output: 'standalone'`, non-root user `nextjs:1001`
- Kubernetes: namespace `hospital`, 2 replicas, ConfigMap for URLs, Secrets for credentials
- Health check endpoint: `/api/health`
