#!/usr/bin/env bash
# Setup nextjs-bff service account on Keycloak
# Usage: bash scripts/setup-keycloak-service-account.sh

set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-https://keycloak-his-rbac.zeabur.app}"
REALM="${KEYCLOAK_REALM:-hospital}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?Need KEYCLOAK_ADMIN_PASSWORD}"
CLIENT_ID="nextjs-bff"

echo "==> Target: $KEYCLOAK_URL / realm: $REALM"

# ── Step 1: Get admin token from master realm ──────────────────────────────
echo "==> [1/5] Getting admin token..."
ADMIN_TOKEN=$(curl -sf "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username=$ADMIN_USER&password=$ADMIN_PASS" \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

[ -z "$ADMIN_TOKEN" ] && { echo "ERROR: Failed to get admin token"; exit 1; }
echo "    OK"

AUTH="Authorization: Bearer $ADMIN_TOKEN"
BASE="$KEYCLOAK_URL/admin/realms/$REALM"

# ── Step 2: Get nextjs-bff client UUID ────────────────────────────────────
echo "==> [2/5] Getting nextjs-bff client UUID..."
CLIENT_UUID=$(curl -sf "$BASE/clients?clientId=$CLIENT_ID" -H "$AUTH" \
  | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

[ -z "$CLIENT_UUID" ] && { echo "ERROR: Client $CLIENT_ID not found"; exit 1; }
echo "    UUID: $CLIENT_UUID"

# ── Step 3: Enable serviceAccountsEnabled on the client ───────────────────
echo "==> [3/5] Enabling serviceAccountsEnabled..."
CLIENT_JSON=$(curl -sf "$BASE/clients/$CLIENT_UUID" -H "$AUTH")

# Patch serviceAccountsEnabled to true
PATCHED=$(echo "$CLIENT_JSON" | sed 's/"serviceAccountsEnabled":false/"serviceAccountsEnabled":true/' \
  | grep -q '"serviceAccountsEnabled"' \
  && echo "$CLIENT_JSON" | sed 's/"serviceAccountsEnabled":false/"serviceAccountsEnabled":true/' \
  || echo "$CLIENT_JSON" | sed 's/"standardFlowEnabled":true/"standardFlowEnabled":true,"serviceAccountsEnabled":true/')

curl -sf -X PUT "$BASE/clients/$CLIENT_UUID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "$PATCHED" && echo "    OK" || { echo "ERROR: Failed to update client"; exit 1; }

# ── Step 4: Get service account user ──────────────────────────────────────
echo "==> [4/5] Getting service account user..."
SA_USER_ID=$(curl -sf "$BASE/clients/$CLIENT_UUID/service-account-user" -H "$AUTH" \
  | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

[ -z "$SA_USER_ID" ] && { echo "ERROR: Service account user not found (is serviceAccountsEnabled active?)"; exit 1; }
echo "    SA User ID: $SA_USER_ID"

# ── Step 5: Get realm-management client UUID ──────────────────────────────
echo "==> [5/5] Assigning realm-management roles..."
RM_UUID=$(curl -sf "$BASE/clients?clientId=realm-management" -H "$AUTH" \
  | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

[ -z "$RM_UUID" ] && { echo "ERROR: realm-management client not found"; exit 1; }

# Get role objects for manage-users and view-users
MANAGE_ROLE=$(curl -sf "$BASE/clients/$RM_UUID/roles/manage-users" -H "$AUTH")
VIEW_ROLE=$(curl -sf "$BASE/clients/$RM_UUID/roles/view-users" -H "$AUTH")

# Assign both roles to the service account
curl -sf -X POST "$BASE/users/$SA_USER_ID/role-mappings/clients/$RM_UUID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "[$MANAGE_ROLE,$VIEW_ROLE]" && echo "    manage-users + view-users assigned" \
  || echo "    (roles may already be assigned, continuing)"

echo ""
echo "Done! nextjs-bff service account is now configured."
echo "Test: visit /admin/users in the app — user list should load."
