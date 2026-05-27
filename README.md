# Next.js + Keycloak 角色存取控制（RBAC）

> **技術棧：** Next.js 14 App Router · iron-session · jose · Keycloak 24 · Docker / Kubernetes（地端部署）

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/smlht2005/nextjs-keycloak-rbac)

---

## 目錄

- [GitHub Codespaces 快速啟動](#github-codespaces-快速啟動)
- [系統架構](#系統架構)
- [驗證流程詳解](#驗證流程詳解)
- [角色與權限對照表](#角色與權限對照表)
- [頁面說明](#頁面說明)
- [API 路由說明](#api-路由說明)
- [核心函式庫說明](#核心函式庫說明)
- [Middleware 說明](#middleware-說明)
- [Keycloak 設定](#keycloak-設定)
- [Kubernetes 部署](#kubernetes-部署)
- [快速開始](#快速開始)
- [安全設計決策](#安全設計決策)
- [環境變數說明](#環境變數說明)

---

## GitHub Codespaces 快速啟動

### 一鍵開啟

點擊上方 **Open in GitHub Codespaces** 徽章，或至 GitHub 儲存庫頁面按下 `Code → Codespaces → Create codespace on main`。

### 自動化流程

Codespace 建立後會自動執行以下步驟：

```
1. 啟動三個容器（docker-compose.codespace.yml）
   ├── postgres:16-alpine      ← Keycloak 資料庫
   ├── quay.io/keycloak:24.0   ← 身份提供者（port 8080）
   └── node:20-alpine          ← Next.js 開發容器（port 3000）

2. postCreateCommand → .devcontainer/setup.sh
   ├── 偵測 Codespace 動態 URL（CODESPACE_NAME 環境變數）
   ├── 自動產生 SESSION_SECRET（32 bytes 隨機值）
   ├── 建立 .env.local（含正確的 KEYCLOAK_URL 與 NEXTJS_URL）
   └── npm install

3. postStartCommand → npm run dev
   └── Next.js 開發伺服器自動啟動於 port 3000
```

### 連線資訊

| 服務 | Codespace 網址 | 說明 |
|---|---|---|
| **Next.js App** | `https://{codespace-name}-3000.app.github.dev` | 主應用程式（自動在瀏覽器開啟） |
| **Keycloak Admin** | `https://{codespace-name}-8080.app.github.dev/admin` | 身份管理後台 |

> Codespace 名稱可在 VS Code 左下角或 GitHub Codespaces 頁面查看。

### 預設測試帳號

開發用 Realm（`keycloak-realm-config.dev.json`）已預建以下帳號：

| 帳號 | 密碼 | 角色 | 可存取頁面 |
|---|---|---|---|
| `admin-user` | `Admin1234!` | admin | /dashboard、/admin |
| `doctor-user` | `Doctor1234!` | doctor | /dashboard |
| `nurse-user` | `Nurse1234!` | nurse | /dashboard |
| `viewer-user` | `Viewer1234!` | viewer | /dashboard |

### Keycloak Admin 後台

| 項目 | 值 |
|---|---|
| 網址 | `https://{codespace-name}-8080.app.github.dev/admin` |
| 帳號 | `admin` |
| 密碼 | `devpassword123` |

> ⚠️ Keycloak 首次啟動需 **30～60 秒**，請等待後再嘗試登入。

### Devcontainer 檔案說明

```
.devcontainer/
├── devcontainer.json              # Codespaces 主設定
├── docker-compose.codespace.yml   # 開發用 compose（獨立，不依賴生產設定）
└── setup.sh                       # postCreateCommand：偵測 URL、建立 env、npm install

k8s/
├── keycloak-realm-config.json     # 生產用 Realm 設定（嚴格 redirect URI）
└── keycloak-realm-config.dev.json # 開發用 Realm 設定（含測試帳號、寬鬆 redirect）
```

### 開發 vs 生產設定差異

| 項目 | 開發（Codespaces） | 生產（K8s） |
|---|---|---|
| Realm 設定 | `keycloak-realm-config.dev.json` | `keycloak-realm-config.json` |
| Client Secret | `dev-secret-not-for-production` | Kubernetes Secret |
| Redirect URI | `https://*.app.github.dev/*` + `localhost` | 固定生產 URL |
| sslRequired | `none` | `external` |
| 測試帳號 | 已預建 4 個 | 手動建立 |
| SESSION_SECRET | setup.sh 自動產生 | Kubernetes Secret |

---

## 系統架構

```
┌─────────────────────────────────────────────────────────────────┐
│                          瀏覽器（Browser）                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ 1. 訪問受保護頁面
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Next.js Middleware（Edge Runtime）              │
│  • 檢查 hospital_session Cookie 是否存在                          │
│  • 公開路徑（/login、/unauthorized、/api/auth/*）直接放行          │
│  • 未登入 → 重導向 /api/auth/login                                │
└────────────────────────────┬────────────────────────────────────┘
                             │ 2. 已有 Cookie，進入應用程式
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js App Router                           │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────────┐    │
│  │   頁面（Pages）      │    │     API 路由（API Routes）    │    │
│  │                     │    │                              │    │
│  │  /login             │    │  /api/auth/login    ─────────┼──► │
│  │  /unauthorized      │    │  /api/auth/callback ◄────────┼──  │
│  │  /dashboard  ───────┼──► │  /api/auth/logout            │    │
│  │  /admin      ───────┼──► │  /api/bff/patients           │    │
│  │                     │    │  /api/bff/admin              │    │
│  └─────────────────────┘    └──────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │ 3. PKCE 授權碼流程
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Keycloak 24（身份提供者）                       │
│  • 驗證用戶帳號密碼                                               │
│  • 簽發 JWT Access Token（含 realm_access.roles）                 │
│  • 簽發 Refresh Token                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ 4. 令牌驗證後代理請求
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      後端微服務（Microservices）                   │
│  • patient-service:8081（病患資料服務）                            │
│  • admin-service:8082（管理服務）                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心設計原則

| 原則 | 實作方式 |
|---|---|
| **令牌不外洩** | Access Token 與 Refresh Token 儲存於加密 httpOnly Cookie，JavaScript 無法存取 |
| **BFF 模式** | 瀏覽器不直接呼叫微服務，所有 API 請求透過 Next.js BFF 路由代理 |
| **伺服器端驗證** | 角色檢查在 Node.js Server Runtime 執行，不依賴前端判斷 |
| **PKCE 強制** | 使用 S256 演算法，防止授權碼攔截攻擊 |

---

## 驗證流程詳解

### 登入流程（PKCE 授權碼流程）

```
1. 用戶點擊「Sign in with Keycloak」
   └─► GET /api/auth/login
         ├─ 產生 code_verifier（32 bytes 隨機值，base64url 編碼）
         ├─ 計算 code_challenge = SHA-256(code_verifier)，base64url 編碼
         ├─ 產生 state（16 bytes 隨機值，hex 編碼，防 CSRF）
         ├─ 將 code_verifier + state 存入加密 Session Cookie
         └─ 重導向至 Keycloak 授權端點

2. Keycloak 驗證用戶身份後
   └─► GET /api/auth/callback?code=xxx&state=yyy
         ├─ 驗證 state 與 Session 中的值是否一致（防 CSRF）
         ├─ 使用 code + code_verifier 向 Keycloak 換取令牌（5 秒超時）
         ├─ 將 access_token、refresh_token、id_token 存入加密 Session
         ├─ 清除 code_verifier 與 state
         └─ 重導向至 /dashboard

3. 後續請求
   └─► Middleware 檢查 Cookie 存在 → 通過
       └─► 頁面/BFF 呼叫 requireAuth() 驗證 JWT 簽章與 audience
```

### 令牌刷新流程

```
requireAuth() 發現 Access Token 將於 60 秒內過期
   ├─ 使用 Refresh Token 向 Keycloak 換取新令牌（5 秒超時）
   ├─ 驗證新 Access Token 的 JWT 簽章與 audience
   ├─ 更新 Session 中的令牌
   └─ 繼續處理原始請求

若 Refresh Token 已過期或刷新失敗
   └─ 清除 Session → 重導向 /api/auth/login
```

### 登出流程

```
GET /api/auth/logout
   ├─ 取得 Session 中的 id_token
   ├─ 銷毀 Server-Side Session（清除 Cookie）
   └─ 重導向至 Keycloak 登出端點（含 id_token_hint）
       └─ Keycloak 完成 SSO 登出後，重導向至 /login
```

---

## 角色與權限對照表

| 角色 | patient:read | patient:write | patient:delete | user:manage | config:write | audit:read | order:write | vitals:write |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **doctor** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **nurse** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **viewer** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

角色定義於 `types/auth.ts`，由 Keycloak Realm 角色透過群組機制傳播至 JWT 的 `realm_access.roles` 欄位。

---

## 頁面說明

### `app/layout.tsx` — 根版型

```
路徑：/（所有頁面的最外層容器）
```

**職責：**
- 設定整個應用程式的 HTML 根結構
- 宣告語言為繁體中文（`lang="zh-TW"`）
- 設定網頁標題（`HIS RBAC`）與描述（`Hospital Information System`）
- 所有子頁面皆被此版型包覆

**實作重點：**
- 使用 Next.js `Metadata` API 設定 SEO 資訊
- 純 Server Component，無用戶端邏輯

---

### `app/(auth)/login/page.tsx` — 登入頁面

```
路徑：/login
存取控制：公開（無需登入）
```

**職責：**
- 顯示醫院資訊系統的登入入口
- 提供「Sign in with Keycloak」按鈕，點擊後導向 `/api/auth/login` 發起 PKCE 流程

**流程：**
```
用戶訪問 /login
    └─► 顯示登入按鈕
         └─► 用戶點擊 → 瀏覽器跳轉至 /api/auth/login（發起 PKCE）
```

**設計特點：**
- 純靜態頁面，無伺服器端邏輯
- 登入邏輯完全由 `/api/auth/login` API 路由處理，頁面只負責 UI

---

### `app/(auth)/unauthorized/page.tsx` — 無權限頁面

```
路徑：/unauthorized
存取控制：公開（登入後但角色不符時顯示）
```

**職責：**
- 當用戶已登入但嘗試存取超出其角色權限的頁面時顯示
- 提供返回儀表板的連結

**觸發時機：**
```
requireRoles(['admin'])  ← 用戶角色為 doctor
    └─► redirect('/unauthorized')  ← 自動跳轉至此頁面
```

---

### `app/(protected)/layout.tsx` — 受保護路由版型

```
路徑：/dashboard、/admin 等所有受保護頁面的共用版型
存取控制：需要有效的 JWT（已登入）
```

**職責：**
- 作為所有受保護頁面的第一道守衛
- 呼叫 `requireAuth()` 完整驗證：JWT 簽章、Audience、過期時間、自動刷新
- 驗證失敗時自動重導向至 `/api/auth/login`

**執行順序：**
```
瀏覽器請求 /dashboard
    └─► Middleware（檢查 Cookie 存在）
         └─► ProtectedLayout（呼叫 requireAuth() 驗證 JWT）
              └─► DashboardPage（執行頁面邏輯）
```

**與 Middleware 的分工：**

| 層級 | 執行環境 | 驗證內容 |
|---|---|---|
| Middleware | Edge Runtime | 僅檢查 Cookie 是否存在（快速過濾） |
| ProtectedLayout | Node.js Runtime | 完整 JWT 驗證（簽章、audience、過期） |

---

### `app/(protected)/dashboard/page.tsx` — 儀表板頁面

```
路徑：/dashboard
存取控制：所有已登入用戶（admin、doctor、nurse、viewer）
```

**職責：**
- 顯示當前登入用戶的姓名（`preferred_username`）
- 顯示用戶所擁有的角色列表
- 作為登入後的預設落地頁面

**資料來源：**
```typescript
const { username, roles } = await requireAuth()
// username → JWT 中的 preferred_username 欄位
// roles    → JWT 中的 realm_access.roles 陣列
```

**執行流程：**
```
requireAuth()
    ├─ 取得加密 Session 中的 access_token
    ├─ 驗證 JWT（JWKS 遠端驗證、audience、issuer）
    ├─ 若令牌即將過期（60 秒內）→ 自動刷新
    └─ 回傳 { username, roles, accessToken, payload }
```

---

### `app/(protected)/admin/page.tsx` — 管理員頁面

```
路徑：/admin
存取控制：限 admin 角色
```

**職責：**
- 僅允許擁有 `admin` 角色的用戶存取
- 作為管理功能的入口頁面

**角色驗證：**
```typescript
await requireRoles(['admin'])
// 若用戶角色不包含 'admin' → redirect('/unauthorized')
```

**與儀表板的差異：**

| 頁面 | 使用函數 | 允許角色 |
|---|---|---|
| `/dashboard` | `requireAuth()` | 所有已登入用戶 |
| `/admin` | `requireRoles(['admin'])` | 僅 admin |

---

## API 路由說明

### `app/api/auth/login/route.ts` — 發起登入

```
端點：GET /api/auth/login
存取控制：公開
```

**職責：** 產生 PKCE 參數並將用戶重導向至 Keycloak 授權頁面

**執行步驟：**

```
1. 產生 code_verifier
   └─ crypto.randomBytes(32).toString('base64url')
   └─ 32 bytes = 256 bits 隨機熵，符合 PKCE 規範（43–128 字元）

2. 計算 code_challenge
   └─ SHA-256(code_verifier)，base64url 編碼（無填充）
   └─ 使用 S256 方法，防止 plain 方法降級攻擊

3. 產生 state
   └─ crypto.randomBytes(16).toString('hex')
   └─ 32 字元的隨機值，用於防止 CSRF 攻擊

4. 儲存至加密 Session
   └─ session.codeVerifier = code_verifier
   └─ session.state = state
   └─ await session.save()

5. 重導向至 Keycloak
   └─ 授權端點?response_type=code
              &client_id=nextjs-bff
              &redirect_uri=/api/auth/callback
              &scope=openid
              &state={state}
              &code_challenge={code_challenge}
              &code_challenge_method=S256
```

---

### `app/api/auth/callback/route.ts` — 處理 Keycloak 回調

```
端點：GET /api/auth/callback?code=xxx&state=yyy
存取控制：公開（由 Keycloak 重導向，附帶授權碼）
```

**職責：** 驗證回調參數、交換令牌、建立用戶 Session

**執行步驟：**

```
1. 驗證回調參數
   ├─ 檢查是否有 error 參數（Keycloak 拒絕授權）
   ├─ 確認 code 與 state 均存在
   └─ 若有問題 → redirect('/login')

2. 驗證 state（防 CSRF）
   ├─ 比對 URL 中的 state 與 Session 中的 state
   ├─ 確認 Session 中的 codeVerifier 存在
   └─ 不符合 → 銷毀 Session，redirect('/login')

3. 交換令牌（Token Exchange）
   └─ POST Keycloak /token
      ├─ grant_type=authorization_code
      ├─ code={授權碼}
      ├─ code_verifier={Session 中的 code_verifier}
      ├─ redirect_uri={設定的回調 URL}
      └─ 超時限制：5 秒

4. 儲存令牌至加密 Session
   ├─ access_token（用於呼叫微服務）
   ├─ refresh_token（用於刷新過期的 access_token）
   ├─ expiresAt（Unix 時間戳，用於過期判斷）
   ├─ 清除 codeVerifier 與 state（一次性使用）
   └─ ⚠️  id_token 不存入 Session（三個 JWT 合計超過 4KB 瀏覽器 Cookie 限制）

5. redirect('/dashboard')
```

---

### `app/api/auth/logout/route.ts` — 登出

```
端點：GET /api/auth/logout
存取控制：已登入用戶
```

**職責：** 銷毀本地 Session 並觸發 Keycloak SSO 登出

**執行步驟：**

```
1. 取出 Session 中的 id_token
2. 呼叫 session.destroy()（清除加密 Cookie）
3. 重導向至 Keycloak 登出端點
   └─ ?client_id=nextjs-bff
      &post_logout_redirect_uri={NEXTJS_URL}/login
```

> ⚠️ `id_token_hint` 未傳送（`idToken` 不儲存於 Session 以避免 Cookie 超過 4KB 上限）。Keycloak 在沒有 `id_token_hint` 的情況下仍可完成本地登出並重導向至指定 URI。

---

### `app/api/bff/patients/route.ts` — 病患服務代理

```
端點：GET/POST/DELETE /api/bff/patients
存取控制：依 HTTP 方法不同
```

**BFF（Backend for Frontend）模式說明：**
瀏覽器不直接呼叫後端微服務，而是透過此路由代理，由伺服器端持有並驗證令牌後才轉發請求。

| 方法 | 允許角色 | 上游端點 | 說明 |
|---|---|---|---|
| `GET` | admin, doctor, nurse, viewer | `GET /patients` | 查詢病患列表 |
| `POST` | admin, doctor | `POST /patients` | 新增病患 |
| `DELETE` | admin | `DELETE /patients/{id}` | 刪除病患 |

**安全機制：**

```typescript
// GET：只允許白名單中的查詢參數，防止參數注入
const ALLOWED_QUERY_PARAMS = ['page', 'limit', 'search', 'sort']
const filtered = new URLSearchParams()
for (const k of ALLOWED_QUERY_PARAMS) {
  const v = req.nextUrl.searchParams.get(k)
  if (v) filtered.set(k, v)
}

// POST：驗證請求體格式
if (!body || typeof body !== 'object' || Array.isArray(body)) {
  return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
}

// DELETE：驗證 id 為 UUID 格式，防止路徑注入
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!id || !UUID_RE.test(id)) {
  return NextResponse.json({ error: 'Invalid or missing patient id' }, { status: 400 })
}
```

---

### `app/api/bff/admin/route.ts` — 管理服務代理

```
端點：GET /api/bff/admin
存取控制：限 admin 角色
```

**職責：** 代理請求至管理微服務（`ADMIN_SERVICE_URL`），轉發 Access Token 作為 Bearer 驗證

```typescript
const { accessToken } = await requireRoles(['admin'])
const res = await fetch(new URL('/admin', UPSTREAM), {
  headers: { Authorization: `Bearer ${accessToken}` },
})
```

微服務端可再次驗證此 JWT，實現雙層驗證（BFF 層 + 微服務層）。

---

## 核心函式庫說明

### `lib/keycloak-config.ts` — Keycloak 設定

**職責：** 集中管理 Keycloak 連線設定，在模組載入時驗證必要環境變數

```typescript
function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required environment variable: ${name}`)
  return val
}
```

- **啟動時驗證**：任何必要環境變數缺失，應用程式立即拋出錯誤，而非在請求時才失敗
- **集中管理**：所有 Keycloak 端點 URL 由此計算，其他模組直接引用 `keycloakUrls`

**提供的端點 URL：**

| 常數 | 用途 |
|---|---|
| `keycloakUrls.authEndpoint` | 授權端點（PKCE 重導向目標） |
| `keycloakUrls.tokenEndpoint` | 令牌端點（換取 / 刷新令牌） |
| `keycloakUrls.logoutEndpoint` | 登出端點（SSO 登出） |
| `keycloakUrls.jwksUri` | JWKS 端點（取得公鑰驗證 JWT） |
| `keycloakUrls.issuer` | 簽發者（JWT 驗證用） |

---

### `lib/session.ts` — Session 管理

**職責：** 使用 `iron-session` 建立加密的 httpOnly Cookie Session

**Session 資料結構：**

```typescript
interface SessionData {
  accessToken?:  string  // Keycloak JWT Access Token
  refreshToken?: string  // 用於刷新 Access Token
  expiresAt?:    number  // Access Token 過期的 Unix 時間戳
  codeVerifier?: string  // PKCE code_verifier（登入流程中暫存）
  state?:        string  // CSRF 防護 state（登入流程中暫存）
  // ⚠️ idToken 不存入 Session：三個 JWT 合計 ~4.3KB 超過瀏覽器 4KB Cookie 上限
}
```

**Cookie 安全設定：**

| 設定 | 值 | 說明 |
|---|---|---|
| `httpOnly` | `true` | JavaScript 無法讀取 Cookie |
| `secure` | `true` | 僅透過 HTTPS 傳輸 |
| `sameSite` | `'lax'` | 允許跨站 Redirect 攜帶 Cookie（OAuth Callback 必要）|
| `maxAge` | `3600`（1 小時） | Cookie 最大存活時間 |

**加密原理：**
`iron-session` 使用 `SESSION_SECRET` 對 Cookie 值進行 HMAC-SHA256 簽名並以 AES-256 加密，即使 Cookie 被截取也無法讀取或偽造內容。

---

### `lib/jwt-verify.ts` — JWT 驗證

**職責：** 使用 Keycloak 的 JWKS 端點遠端驗證 JWT 簽章

```typescript
const JWKS = createRemoteJWKSet(new URL(keycloakUrls.jwksUri))

export async function verifyAccessToken(token: string): Promise<KeycloakJWTPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer:   keycloakUrls.issuer,   // 驗證簽發者
    audience: keycloakConfig.clientId, // 驗證 Audience，防止跨客戶端令牌重用
  })
  return payload as KeycloakJWTPayload
}
```

**驗證項目：**

| 項目 | 說明 |
|---|---|
| **JWT 簽章** | 使用 Keycloak 公鑰（RSA/EC）驗證簽章，防止偽造 |
| **issuer（iss）** | 確認令牌由正確的 Keycloak Realm 簽發 |
| **audience（aud）** | 確認令牌是給本應用程式（`nextjs-bff`）使用的 |
| **過期時間（exp）** | jose 自動驗證，過期令牌會被拒絕 |

**JWKS 快取機制：**
`createRemoteJWKSet` 會快取公鑰，避免每次請求都向 Keycloak 查詢，顯著降低延遲。Keycloak 輪換金鑰時，jose 會自動重新取得新公鑰。

---

### `lib/pkce.ts` — PKCE 工具函數

**職責：** 產生符合 OAuth 2.0 PKCE 規範（RFC 7636）的密碼學安全隨機值

```typescript
// code_verifier：32 bytes 隨機值，base64url 編碼（約 43 字元）
generateCodeVerifier() → crypto.randomBytes(32).toString('base64url')

// code_challenge：SHA-256 雜湊後 base64url 編碼
generateCodeChallenge(verifier) → SHA256(verifier).base64url

// state：16 bytes 隨機值，hex 編碼（32 字元），防 CSRF
generateState() → crypto.randomBytes(16).toString('hex')
```

**為何使用 PKCE？**
標準授權碼流程中，惡意應用程式可能攔截授權碼後直接換取令牌。PKCE 透過「挑戰-驗證」機制確保只有發起授權請求的同一方才能換取令牌。

---

### `lib/token-exchange.ts` — 令牌交換

**職責：** 封裝與 Keycloak Token 端點的通訊（授權碼換取令牌、刷新令牌）

**共用設定：**
```typescript
// ⚠️ AbortSignal.timeout() 必須每次呼叫時建立，不能設為模組常數。
// 模組常數只建立一次，5 秒後 signal 永久 aborted，所有後續 fetch 立刻失敗。
const fetchOpts = () => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  signal: AbortSignal.timeout(5000),  // 每次呼叫時重新建立，5 秒計時重新開始
})

**兩個函數：**

| 函數 | 使用時機 | 主要參數 |
|---|---|---|
| `exchangeCodeForTokens` | 登入回調時，將授權碼換成令牌 | `code`、`codeVerifier` |
| `refreshTokens` | Access Token 即將過期時自動刷新 | `refreshToken` |

---

### `lib/auth-guard.ts` — 驗證守衛

**職責：** 提供 `requireAuth()` 與 `requireRoles()` 兩個守衛函數，供頁面與 BFF 路由呼叫

**`requireAuth()` 執行流程：**

```
1. 取得 Session → 檢查 access_token 是否存在
2. 檢查令牌是否即將過期（60 秒緩衝）
   ├─ 是 → 使用 refresh_token 取得新令牌
   │       → 驗證新令牌的 JWT 簽章（防惡意端點注入）
   │       → 更新 Session
   └─ 否 → 繼續
3. 使用 JWKS 驗證 access_token 的 JWT 簽章
4. 從 JWT payload 提取 realm_access.roles
5. 回傳 AuthContext { accessToken, payload, roles, username }
```

**`requireRoles(allowedRoles)` 執行流程：**

```
呼叫 requireAuth()（完整驗證）
    └─ 檢查用戶角色是否與 allowedRoles 有交集
        ├─ 有 → 回傳 AuthContext
        └─ 無 → redirect('/unauthorized')
```

**60 秒緩衝的意義：**
若緩衝設為 0，令牌可能在「驗證通過」與「實際呼叫微服務」之間的毫秒差距中過期，導致請求失敗。60 秒緩衝確保令牌在整個請求處理期間都有效。

---

## Middleware 說明

### `middleware.ts` — 全域路由守衛

```
執行環境：Edge Runtime（部署於 CDN 邊緣節點）
執行時機：每次 HTTP 請求前
```

**職責：** 快速過濾未登入的請求，防止未授權用戶接觸應用程式

**路由放行規則：**

```typescript
const PUBLIC_PATHS  = new Set(['/login', '/unauthorized', '/favicon.ico'])
const PUBLIC_PREFIX = ['/api/auth/', '/_next/']

// 精確路徑比對（防止 /login-admin 誤放行）
// 前綴比對含尾部斜線（防止 /api/authentication 誤放行）
```

| 請求路徑 | 判斷結果 |
|---|---|
| `/login` | ✅ 放行（精確比對） |
| `/login-admin` | ❌ 攔截（不在放行清單） |
| `/api/auth/login` | ✅ 放行（前綴比對） |
| `/api/authentication` | ❌ 攔截（前綴不符） |
| `/dashboard` | ❌ 攔截 → 重導向登入 |

**與 ProtectedLayout 的分層設計：**

```
Middleware（Edge）   → 檢查 Cookie 存在（輕量、快速）
ProtectedLayout（Node.js）→ 驗證 JWT 簽章與 audience（完整、安全）
```

Middleware 故意只做輕量檢查，因為 Edge Runtime 不支援某些 Node.js API（如 JWKS 憑證鏈驗證），完整的 JWT 驗證由 Server Component 負責。

---

## Keycloak 設定

### Realm 設定（`k8s/keycloak-realm-config.json`）

**客戶端（Client）設定：**

| 設定項目 | 值 | 說明 |
|---|---|---|
| `clientId` | `nextjs-bff` | 應用程式識別碼 |
| `publicClient` | `false` | 機密客戶端，需要 client_secret |
| `standardFlowEnabled` | `true` | 啟用授權碼流程 |
| `directAccessGrantsEnabled` | `false` | 停用密碼憑證流程（更安全） |
| `pkce.code.challenge.method` | `S256` | 強制使用 PKCE S256（Keycloak 24 `attributes` 寫法）|

**Protocol Mappers（必要設定）：**

| Mapper 名稱 | 類型 | 用途 |
|---|---|---|
| `audience-mapper` | `oidc-audience-mapper` | 在 access token 的 `aud` claim 加入 `nextjs-bff`，讓 JWT audience 驗證通過 |
| `username` | `oidc-usermodel-property-mapper` | 將 Keycloak `username` 屬性對應到 JWT 的 `preferred_username` claim |

**Realm 角色：**
`admin`、`doctor`、`nurse`、`viewer`

**群組與角色對應：**

| 群組 | 自動賦予角色 |
|---|---|
| `admin-group` | admin |
| `doctor-group` | doctor |
| `nurse-group` | nurse |
| `viewer-group` | viewer |

**角色傳播至 JWT：**
透過 Protocol Mapper（`realm-roles-mapper`），用戶的群組角色會自動出現在 JWT 的 `realm_access.roles` 陣列中。

### Keycloak 群組設定步驟

```
1. Keycloak Admin Console → 左側選單 Realm → hospital
2. 左側選單 → Groups → Create group
3. 建立四個群組：
   admin-group / doctor-group / nurse-group / viewer-group
4. 點擊各群組 → Role mapping → Assign role
   → 選擇對應的 Realm role
5. 左側選單 → Users → 選擇用戶 → Groups → Join group
   → 用戶即自動取得群組對應的角色
```

---

## Kubernetes 部署

### 部署架構（`k8s/deployment.yaml`）

```
hospital namespace
├── Secret（nextjs-rbac-secrets）
│   ├── keycloak-client-secret
│   └── session-secret
├── Deployment（nextjs-rbac）
│   ├── 2 個副本（最小）
│   ├── 非 root 用戶（uid: 1001）
│   ├── readinessProbe（/api/health，啟動後 10 秒開始檢查）
│   └── livenessProbe（/api/health，啟動後 30 秒開始檢查）
├── Service（nextjs-rbac）
│   └── port 80 → targetPort 3000
├── Ingress（nginx）
│   └── his.hospital.internal → TLS → Service
├── HorizontalPodAutoscaler
│   ├── 最小副本：2，最大副本：10
│   ├── CPU 使用率 > 70% 時擴容
│   └── 記憶體使用率 > 80% 時擴容
└── PodDisruptionBudget
    └── minAvailable: 1（叢集維護時至少保持 1 個 Pod 存活）
```

### 部署指令

```bash
# 1. 建立 Namespace 與 Secret
kubectl create secret generic nextjs-rbac-secrets \
  --from-literal=keycloak-client-secret=$(echo -n "從Keycloak取得的密鑰") \
  --from-literal=session-secret=$(openssl rand -hex 32) \
  -n hospital

# 2. 部署所有資源
kubectl apply -f k8s/deployment.yaml

# 3. 確認部署狀態
kubectl rollout status deployment/nextjs-rbac -n hospital
kubectl get pods -n hospital

# 4. 更新版本
kubectl set image deployment/nextjs-rbac nextjs=hospital/nextjs-rbac:v1.1.0 -n hospital
```

---

## 快速開始

### 1. 設定環境變數

```bash
cp .env.example .env.local
```

最少必填項目：

```env
KEYCLOAK_CLIENT_SECRET=<從-Keycloak-Admin-取得>
SESSION_SECRET=<執行下方指令取得>
POSTGRES_PASSWORD=<自訂強密碼>
KEYCLOAK_ADMIN_PASSWORD=<自訂強密碼>
```

產生 SESSION_SECRET：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. 啟動本地開發環境

```bash
docker compose up -d
```

| 服務 | 網址 |
|---|---|
| 應用程式 | http://localhost:3000 |
| Keycloak 管理後台 | http://localhost:8080 |

### 3. 安裝套件並啟動開發伺服器

```bash
npm install
npm run dev
```

### 4. 安全性稽核

```bash
npm run audit  # 等同於 npm audit --audit-level=high
```

---

## 安全設計決策

| 決策 | 理由 |
|---|---|
| **iron-session 加密 Cookie** | `refresh_token` 永不暴露給前端 JS；httpOnly + Secure + SameSite=Lax 防護 |
| **SameSite=Lax（非 Strict）** | OAuth Callback 是跨站 Redirect（Keycloak → Next.js），`Strict` 會讓瀏覽器在 Redirect 時不帶 Cookie，導致 state 驗證失敗 |
| **Session 不存 idToken** | Access Token + Refresh Token 已達 ~3KB；加入 idToken 會使加密後 Cookie 超過瀏覽器 4KB 限制 |
| **fetchOpts() 函數（非常數）** | `AbortSignal.timeout()` 在建立時開始計時，若定義為模組常數，5 秒後 signal 永久 aborted，所有 fetch 失敗 |
| **角色驗證在 BFF API Route** | Middleware 執行於 Edge Runtime；jose JWKS 驗證需要 Node.js Runtime，不能在 Edge 執行 |
| **JWKS 快取** | `createRemoteJWKSet` 快取公鑰，避免每次請求都向 Keycloak 查詢公鑰 |
| **Keycloak Groups → Roles** | 可擴展性高；將用戶加入群組即可自動取得角色，無需逐一設定 |
| **PKCE S256 強制啟用** | 防止 `code_challenge_method=plain` 降級攻擊；KC 客戶端設定強制 S256 |
| **JWT Audience 驗證** | 確保令牌僅對 `nextjs-bff` 有效，拒絕其他 Keycloak 客戶端簽發的令牌 |
| **刷新後重新驗證** | 刷新令牌後立即驗證新令牌的 JWT 簽章，防止惡意端點注入偽造令牌 |
| **非 root 容器用戶** | Dockerfile 建立 `nextjs`（uid 1001）用戶，遵循最小權限原則 |
| **啟動時驗證環境變數** | `requireEnv()` 在模組載入時驗證，缺失變數立即報錯，而非在請求時才失敗 |
| **BFF 查詢參數白名單** | 只允許 `page/limit/search/sort` 傳遞至上游，防止參數注入攻擊 |

---

## 環境變數說明

| 變數 | 必填 | 說明 |
|---|:---:|---|
| `KEYCLOAK_URL` | ✅ | Keycloak **公開** URL（瀏覽器導向登入用，例：`https://keycloak.hospital.internal`）|
| `KEYCLOAK_INTERNAL_URL` | ❌ | Keycloak **內部** URL（Server-side token exchange / JWKS，例：`http://keycloak:8080`）；未設定時退而使用 `KEYCLOAK_URL` |
| `KEYCLOAK_REALM` | ✅ | Realm 名稱（例：`hospital`）|
| `KEYCLOAK_CLIENT_ID` | ✅ | 用戶端 ID（例：`nextjs-bff`）|
| `KEYCLOAK_CLIENT_SECRET` | ✅ | 用戶端密鑰（從 Keycloak Admin 取得）|
| `NEXTJS_URL` | ✅ | 應用程式對外網址（無尾部斜線，例：`https://his.hospital.internal`）|
| `SESSION_SECRET` | ✅ | Cookie 加密金鑰（最少 32 字元，使用 `openssl rand -hex 32` 產生） |
| `PATIENT_SERVICE_URL` | ✅ | 病患微服務內部位址（例：`http://patient-service:8081`） |
| `ADMIN_SERVICE_URL` | ✅ | 管理微服務內部位址（例：`http://admin-service:8082`） |
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL 密碼（Docker Compose 使用） |
| `KEYCLOAK_ADMIN_PASSWORD` | ✅ | Keycloak 管理員密碼（Docker Compose 使用） |
| `POSTGRES_USER` | ❌ | PostgreSQL 用戶名（預設：`keycloak`） |
| `KEYCLOAK_ADMIN_USER` | ❌ | Keycloak 管理員帳號（預設：`admin`） |
