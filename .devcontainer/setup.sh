#!/bin/sh
set -e

echo "=================================================="
echo " 開發環境初始化中..."
echo "=================================================="

# ── 安裝 Git ──────────────────────────────────────────
if ! command -v git > /dev/null 2>&1; then
  echo "📦 安裝 Git 中..."
  apk add --no-cache git
  echo "✅ Git 安裝完成"
else
  echo "✅ Git 已存在：$(git --version)"
fi

# ── 安裝 Docker CLI ───────────────────────────────────
if ! command -v docker > /dev/null 2>&1; then
  echo "📦 安裝 Docker CLI 中..."
  apk add --no-cache docker-cli
  echo "✅ Docker CLI 安裝完成"
else
  echo "✅ Docker CLI 已存在：$(docker --version)"
fi

# ── 安裝 curl ─────────────────────────────────────────
if ! command -v curl > /dev/null 2>&1; then
  echo "📦 安裝 curl 中..."
  apk add --no-cache curl
  echo "✅ curl 安裝完成"
else
  echo "✅ curl 已存在：$(curl --version | head -1)"
fi

# ── 偵測執行環境 ──────────────────────────────────────
if [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
  KEYCLOAK_URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  NEXTJS_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  echo "✅ GitHub Codespaces 環境偵測成功"

  # ── 自動設定 Port Visibility 為 Public ───────────────
  echo "🔓 設定 Codespaces Port Visibility 為 Public..."
  for PORT in 3000 8080; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X PATCH \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/user/codespaces/${CODESPACE_NAME}/ports/${PORT}" \
      -d '{"visibility":"public"}')
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
      echo "  ✅ Port ${PORT} → Public"
    else
      echo "  ⚠️  Port ${PORT} 設定失敗 (HTTP ${STATUS})，請手動在 PORTS 面板設定"
    fi
  done
  echo "   Next.js  : $NEXTJS_URL"
  echo "   Keycloak : $KEYCLOAK_URL"
else
  KEYCLOAK_URL="http://localhost:8080"
  NEXTJS_URL="http://localhost:3000"
  echo "ℹ️  本機開發環境"
fi

# ── 產生隨機 SESSION_SECRET ───────────────────────────
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# ── 建立 .env.local ───────────────────────────────────
cat > /workspace/.env.local << EOF
# ── Keycloak ──────────────────────────────────────────
KEYCLOAK_URL=${KEYCLOAK_URL}
# Internal Docker network URL for server-side calls (token exchange, JWKS)
KEYCLOAK_INTERNAL_URL=http://keycloak:8080
KEYCLOAK_REALM=hospital
KEYCLOAK_CLIENT_ID=nextjs-bff
# 開發用固定密鑰，與 keycloak-realm-config.dev.json 一致
KEYCLOAK_CLIENT_SECRET=dev-secret-not-for-production

# ── Next.js ───────────────────────────────────────────
NEXTJS_URL=${NEXTJS_URL}
SESSION_SECRET=${SESSION_SECRET}

# ── 上游微服務（開發時可用 mock 或留空）──────────────
PATIENT_SERVICE_URL=http://localhost:8081
ADMIN_SERVICE_URL=http://localhost:8082
EOF

echo "✅ .env.local 建立完成"

# ── 等待 Keycloak 並更新 redirect URIs ───────────────
if [ -n "$CODESPACE_NAME" ]; then
  echo "⏳ 等待 Keycloak 就緒..."
  RETRY=0
  until curl -sf http://keycloak:8080/realms/hospital > /dev/null 2>&1; do
    RETRY=$((RETRY+1))
    [ $RETRY -gt 24 ] && echo "⚠️  Keycloak 等待逾時，跳過 redirect URI 設定" && break
    sleep 5
  done
  if curl -sf http://keycloak:8080/realms/hospital > /dev/null 2>&1; then
    echo "🔑 更新 Keycloak redirect URIs for Codespace: ${CODESPACE_NAME}..."
    ADMIN_TOKEN=$(curl -s -X POST \
      http://keycloak:8080/realms/master/protocol/openid-connect/token \
      -d "username=admin&password=devpassword123&grant_type=password&client_id=admin-cli" \
      | grep -oE '"access_token":"[^"]+' | cut -d'"' -f4)
    CLIENT_UUID=$(curl -s \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      "http://keycloak:8080/admin/realms/hospital/clients?clientId=nextjs-bff" \
      | grep -oE '"id":"[^"]+' | head -1 | cut -d'"' -f4)
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      "http://keycloak:8080/admin/realms/hospital/clients/$CLIENT_UUID" \
      -d "{\"clientId\":\"nextjs-bff\",\"redirectUris\":[\"${NEXTJS_URL}/api/auth/callback\",\"http://localhost:3000/api/auth/callback\"],\"webOrigins\":[\"+\"]}")
    if [ "$STATUS" = "204" ]; then
      echo "✅ redirect URI 更新成功 → https://${CODESPACE_NAME}-3000.app.github.dev/api/auth/callback"
    else
      echo "⚠️  redirect URI 更新失敗 (HTTP $STATUS)"
    fi
  fi
fi

# ── 安裝 npm 套件 ─────────────────────────────────────
echo "📦 安裝 npm 套件中..."
cd /workspace && npm install
echo "✅ npm install 完成"

# ── 完成訊息 ──────────────────────────────────────────
echo ""
echo "=================================================="
echo " 環境初始化完成！"
echo ""
echo " 🌐 應用程式  : $NEXTJS_URL"
echo " 🔐 Keycloak  : ${KEYCLOAK_URL}/admin"
echo "    帳號      : admin"
echo "    密碼      : devpassword123"
echo ""
echo " ⚠️  Keycloak 需約 30~60 秒完成啟動"
echo "    確認指令  : docker logs -f <keycloak-container>"
echo ""
echo " ▶️  開發伺服器將自動啟動（postStartCommand）"
echo "    或手動執行 : npm run dev"
echo "=================================================="
