# Next.js + Keycloak RBAC on GitHub Codespaces — 除錯紀錄

> 環境：Next.js 14 / Keycloak 24.0 / GitHub Codespaces (Dev Tunnels) / Docker Compose
> 日期：2026-05-26 ～ 2026-05-27

---

## 問題一：Keycloak 容器啟動即崩潰（exit code 1）

### 症狀

```
docker ps → keycloak container 狀態 Exited (1)
```

### 根本原因

`k8s/keycloak-realm-config.dev.json` 使用了 Keycloak 24.0 不支援的屬性名稱：

```json
// ❌ 錯誤（舊版寫法）
"pkceCodeChallengeMethod": "S256"
```

Keycloak 24.0 的 Jackson 反序列化在遇到未知屬性時會拋出 `UnrecognizedPropertyException` 並中止啟動。

### 修法

```json
// ✅ 正確（Keycloak 24.0 寫法）
"attributes": { "pkce.code.challenge.method": "S256" }
```

同樣修正 `k8s/keycloak-realm-config.json`（正式環境設定檔）。

---

## 問題二：`postCreateCommand` 早期退出，npm install 未執行

### 症狀

```
postCreateCommand: exit 127
node_modules/ 不存在，npm run dev 失敗
```

### 根本原因

`.devcontainer/setup.sh` 開頭有 `set -e`，但在安裝 Docker CLI 之後、安裝 `curl` 之前就直接呼叫了 `curl`，導致 `command not found`（exit 127）讓整個 script 提前結束，後續的 `npm install` 從未執行。

### 修法

在 `setup.sh` 中，於使用 `curl` 之前先安裝它：

```sh
apk add --no-cache curl
```

---

## 問題三：OAuth callback cookie 遺失（SameSite=Strict）

### 症狀

```
[callback] STATE MISMATCH or missing codeVerifier
```

### 根本原因

`lib/session.ts` 的 cookie 設定為 `sameSite: 'strict'`。

OAuth 的 Authorization Code Flow 中，Keycloak 完成登入後會將瀏覽器從 `obscure-orbit-...-8080.app.github.dev` redirect 回 `obscure-orbit-...-3000.app.github.dev`。這是**跨 origin 的 redirect**，瀏覽器在 `SameSite=Strict` 模式下不會帶上 session cookie，導致 callback 找不到原本儲存的 `state` 和 `codeVerifier`。

### 修法

```ts
// lib/session.ts
cookieOptions: {
  sameSite: 'lax' as const,  // 改為 lax，允許跨站 redirect 帶 cookie
  secure: true,
  httpOnly: true,
}
```

---

## 問題四：Server-side DNS 無法解析 Keycloak 外部 URL

### 症狀

```
token exchange 失敗
curl https://obscure-orbit-...-8080.app.github.dev/... → exit code 3 (DNS NXDOMAIN)
```

### 根本原因

`.env.local` 的 `KEYCLOAK_URL` 設為 Dev Tunnels 的公開 URL（`https://obscure-orbit-...-8080.app.github.dev`）。Next.js 的 server-side code（token exchange、JWKS 取得）在 Docker **app container 內部**執行，該容器無法解析外部 Codespaces hostname，只能透過 Docker 內部 DNS 存取 `keycloak:8080`。

### 修法

新增環境變數，分開 browser-facing URL 和 server-side URL：

```env
# .env.local
KEYCLOAK_URL=https://obscure-orbit-jjjgxv4r9vppc9rr-8080.app.github.dev   # 瀏覽器用
KEYCLOAK_INTERNAL_URL=http://keycloak:8080                                  # Server-side 用
```

```ts
// lib/keycloak-config.ts
const publicBase = `${keycloakConfig.url}/realms/...`; // 給瀏覽器 redirect
const internalBase = `${keycloakConfig.internalUrl}/realms/...`; // 給 server token exchange / JWKS

export const keycloakUrls = {
  authEndpoint: `${publicBase}/auth`, // 瀏覽器導向 Keycloak 登入
  tokenEndpoint: `${internalBase}/token`, // server-side token exchange
  jwksUri: `${internalBase}/certs`, // server-side JWT 驗證
  issuer: `${keycloakConfig.url}/realms/${realm}`, // 與 token iss 一致
};
```

---

## 問題五：Keycloak `invalid_redirect_uri`

### 症狀

```
Keycloak log: error="invalid_redirect_uri"
  redirect_uri="https://obscure-orbit-...-3000.app.github.dev/api/auth/callback"
```

### 根本原因

Realm 設定中 `redirectUris` 只有 `http://localhost:3000/api/auth/callback`，且之前的版本嘗試使用萬用字元 `https://*.app.github.dev/...`，但 **Keycloak 24.0 不支援子網域萬用字元**。

### 修法

透過 Admin API 動態更新允許的 redirect URI：

```sh
ADMIN_TOKEN=$(curl -s -X POST http://keycloak:8080/realms/master/protocol/openid-connect/token \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=devpassword123" \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

CLIENT_UUID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://keycloak:8080/admin/realms/hospital/clients?clientId=nextjs-bff" \
  | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  "http://keycloak:8080/admin/realms/hospital/clients/$CLIENT_UUID" \
  -d '{"redirectUris":["http://localhost:3000/api/auth/callback","https://obscure-orbit-jjjgxv4r9vppc9rr-3000.app.github.dev/api/auth/callback"]}'
```

同時更新 `setup.sh` 的 `postCreateCommand`，讓每次建立 Codespace 時自動執行此步驟。

---

## 問題六：Dev Tunnels 401（VS Code Simple Browser iframe 問題）

### 症狀

訪問 Dev Tunnels URL 出現 HTTP 401，VS Code Simple Browser 顯示 `chrome-error://chromewebdata/`。

### 根本原因

`devcontainer.json` 的 `onAutoForward: "openBrowser"` 會在 VS Code 的**內嵌 iframe（Simple Browser）**中開啟 port 3000。Dev Tunnels 對嵌入 iframe 的請求會直接回傳 401，因為 iframe 無法完成 GitHub 的 click-through 驗證流程（Dev Tunnels 要求使用者點 "Continue" 確認）。

### 修法

```json
// devcontainer.json
"portsAttributes": {
  "3000": { "onAutoForward": "notify" },   // 改為只顯示通知
  "8080": { "onAutoForward": "notify" }
}
```

**正確做法**：使用真實瀏覽器（Edge/Chrome），分別手動開啟 port 3000 和 port 8080 的 Dev Tunnels URL，各自完成 click-through。

---

## 問題七：Dev Tunnels port 8080 回傳 502 Bad Gateway

### 症狀

```
https://obscure-orbit-...-8080.app.github.dev/ → 502 Bad Gateway
```

### 根本原因

VS Code Dev Tunnels 是把轉發的 port 連接到 **app container 的 `localhost`**，但 Keycloak 跑在獨立的 `keycloak` container，`docker-compose.codespace.yml` 中只有 `expose: "8080"`（Docker 內部網路），沒有 `ports: "8080:8080"`（bind 到 host）。

因此 `localhost:8080` → connection refused（000），Dev Tunnels 拿不到回應，回傳 502。

### 修法

在 app container 啟動 **nginx 反向代理**，將 `localhost:8080` 轉發到 `keycloak:8080`：

```nginx
server {
    listen 8080;
    location / {
        proxy_pass http://keycloak:8080;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host  obscure-orbit-jjjgxv4r9vppc9rr-8080.app.github.dev;
        proxy_set_header X-Forwarded-Port  443;
        proxy_set_header Host $host;
    }
}
```

加入 `postStartCommand`：

```json
"postStartCommand": "apk add --no-cache nginx 2>/dev/null; ... nginx && cd /workspace && npm run dev"
```

> **為什麼要用 nginx 而不是 socat？**
> Keycloak 用 `X-Forwarded-*` headers 判斷自己對外的 URL。socat 是純 TCP 轉發，不會加這些 headers，導致 Keycloak 的 redirect Location 仍然是 `http://localhost:8080/...`，瀏覽器無法存取。nginx 可以在 proxy 時加入正確的 headers。

---

## 問題八：Keycloak redirect 到 `localhost:8080`

### 症狀

完成 Dev Tunnels click-through 後，頁面被 redirect 到 `localhost:8080/admin/`，瀏覽器顯示「無法連線」。

### 根本原因

即使 socat 讓 Dev Tunnels 可以連到 Keycloak，Keycloak 本身在 HTTP 302 的 `Location` header 中仍然寫 `http://localhost:8080/...`，因為它不知道自己對外的真實 hostname。

### 修法

改用 nginx（見問題七），nginx 在轉發請求時帶上：

```
X-Forwarded-Host: obscure-orbit-jjjgxv4r9vppc9rr-8080.app.github.dev
X-Forwarded-Proto: https
X-Forwarded-Port: 443
```

搭配 Keycloak 設定 `KC_PROXY=edge`，讓 Keycloak 信任這些 headers 來建構對外 URL：

```
Location: https://obscure-orbit-jjjgxv4r9vppc9rr-8080.app.github.dev/admin/ ✅
```

---

## 問題九：`invalid_scope: Invalid scopes: openid profile email`

### 症狀

瀏覽器被從 Keycloak redirect 回 callback 並帶有 `error=invalid_scope`。

### 根本原因

`app/api/auth/login/route.ts` 向 Keycloak 請求 `scope: 'openid profile email'`，但 hospital realm 只定義了 `openid`、`roles`、`offline_access` 這三個 client scope，沒有 `profile` 和 `email`。

### 修法

```ts
// app/api/auth/login/route.ts
scope: "openid"; // 移除 profile 和 email
```

或者：在 Keycloak admin 介面為 hospital realm 新增 `profile` 和 `email` 標準 client scopes。

---

## 問題十：callback redirect 到 `...-3000.app.github.dev:3000/login`（多餘的 port）

### 症狀

成功登入後，被 redirect 到 `https://obscure-orbit-...-3000.app.github.dev:3000/login`，瀏覽器顯示「找不到此頁面」。

### 根本原因

`app/api/auth/callback/route.ts` 使用 `new URL('/login', req.url)` 建構 redirect URL。`req.url` 在 Next.js dev server 內部是 `https://obscure-orbit-...-3000.app.github.dev:3000/api/auth/callback`（含 `:3000`），導致 redirect 目標也帶著 `:3000`，但 Dev Tunnels 監聽的是標準 HTTPS port 443，`:3000` 造成連線失敗。

### 修法

```ts
// app/api/auth/callback/route.ts
const appBase =
  process.env.NEXTJS_URL || `${req.nextUrl.protocol}//${req.nextUrl.hostname}`;

// 所有 redirect 改為
return NextResponse.redirect(new URL("/dashboard", appBase));
return NextResponse.redirect(new URL("/login", appBase));
```

`NEXTJS_URL` 在 `.env.local` 設為 `https://obscure-orbit-...-3000.app.github.dev`（不含 port）。

---

## 問題十一：JWT issuer 驗證失敗

### 症狀

登入後 token exchange 成功，但後續 API 呼叫回傳 401 / JWT verify 錯誤。

### 根本原因

`lib/keycloak-config.ts` 的 `issuer` 原本設為 `http://keycloak:8080/realms/hospital`（internal URL），但 Keycloak 在 token 的 `iss` claim 中填入的是對外 URL（受 nginx `X-Forwarded-Host` 影響）：

```
token.iss = "https://obscure-orbit-...-8080.app.github.dev/realms/hospital"
```

JWT 驗證時 expected issuer ≠ actual issuer → 驗證失敗。

### 修法

```ts
// lib/keycloak-config.ts
issuer: `${keycloakConfig.url}/realms/${keycloakConfig.realm}`;
// 使用 KEYCLOAK_URL（public URL），與 token 的 iss 一致
```

---

## 問題十二：JWT audience 驗證失敗

### 症狀

Token 取得成功，但 `verifyAccessToken()` 丟出錯誤。

### 根本原因

`lib/jwt-verify.ts` 驗證 `audience: 'nextjs-bff'`，但 Keycloak 24.0 預設產生的 access token `aud` claim 是 `["account"]`，不包含 `nextjs-bff`。

### 修法

透過 Admin API 為 `nextjs-bff` client 新增 audience protocol mapper：

```sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "http://keycloak:8080/admin/realms/hospital/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "audience-mapper",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-audience-mapper",
    "config": {
      "included.client.audience": "nextjs-bff",
      "access.token.claim": "true",
      "id.token.claim": "false"
    }
  }'
```

同步更新 `k8s/keycloak-realm-config.dev.json`，在 `protocolMappers` 陣列中加入此 mapper，避免每次重建 Codespace 重複手動設定。

---

## 問題十三：`VERIFY_PROFILE` required action — 帳號未完成設定

### 症狀

輸入帳號密碼後，Keycloak 顯示「Account is not fully set up」，無法完成登入。
Keycloak log：

```
type="LOGIN_ERROR", error="resolve_required_actions"
```

### 根本原因

Keycloak 24.0 預設啟用了 `VERIFY_PROFILE` required action，當使用者缺少 `firstName`、`lastName`、`email` 任一欄位時，登入流程會被中斷。`keycloak-realm-config.dev.json` 建立使用者時只設定了帳號和密碼，未設定 profile 欄位。

### 修法

透過 Admin API 為所有使用者補充 profile 資訊並清空 requiredActions：

```sh
ADMIN_TOKEN=$(curl -s -X POST http://keycloak:8080/realms/master/protocol/openid-connect/token \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=devpassword123" \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

for entry in \
  "25c5b337-381a-4eac-a087-65dda292ac60:Admin:User:admin-user@hospital.local" \
  "c72ce7a4-777f-4bd2-9e9b-1043319bb667:Doctor:User:doctor-user@hospital.local" \
  "849585d4-569d-4967-a6d4-fce15515ba9a:Nurse:User:nurse-user@hospital.local" \
  "8d404e30-d7ca-45eb-a063-1f63f63f34e0:Viewer:User:viewer-user@hospital.local"; do
  UUID=$(echo $entry | cut -d: -f1)
  FNAME=$(echo $entry | cut -d: -f2)
  LNAME=$(echo $entry | cut -d: -f3)
  EMAIL=$(echo $entry | cut -d: -f4)
  curl -s -o /dev/null -X PUT \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    "http://keycloak:8080/admin/realms/hospital/users/$UUID" \
    -d "{\"firstName\":\"$FNAME\",\"lastName\":\"$LNAME\",\"email\":\"$EMAIL\",\"emailVerified\":true,\"requiredActions\":[]}"
done
```

永久修法：在 `keycloak-realm-config.dev.json` 的每個 user 物件加入 profile 欄位：

```json
{
  "username": "admin-user",
  "firstName": "Admin",
  "lastName": "User",
  "email": "admin-user@hospital.local",
  "emailVerified": true,
  "enabled": true,
  "credentials": [
    { "type": "password", "value": "Admin1234!", "temporary": false }
  ],
  "realmRoles": ["admin"]
}
```

---

## 問題十四：CSP 阻擋 Next.js HMR（`EvalError: unsafe-eval`）

### 症狀

瀏覽器 console 出現：

```
Uncaught EvalError: Evaluating a string as JavaScript violates the following
Content Security Policy directive because 'unsafe-eval' is not an allowed source of script: script-src 'self' 'unsafe-inline'
at .../react-refresh-utils/dist/runtime.js
```

頁面有時空白或部分 JS 無法執行。

### 根本原因

`next.config.js` 的 `Content-Security-Policy` 中 `script-src` 未包含 `'unsafe-eval'`。Next.js dev mode 的 **react-refresh（HMR 熱重載）** 內部使用 `eval()` 執行程式碼，被 CSP 攔截後功能失效。

### 修法

開發環境才加入 `'unsafe-eval'`，正式環境維持限制：

```js
// next.config.js
const isDev = process.env.NODE_ENV !== "production";

// script-src:
isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" // dev: HMR 需要 eval
  : "script-src 'self' 'unsafe-inline'"; // prod: 不允許 eval
```

---

## 問題十五：Login route 儲存的 session cookie 未出現在 redirect response

### 症狀

Callback route log：

```
[callback] incoming cookies: []
[callback] session.state=undefined | session.codeVerifier=MISSING
[callback] STATE MISMATCH or missing codeVerifier
```

瀏覽器根本沒收到 `hospital_session` cookie，OAuth state 驗證永遠失敗。

### 根本原因

`app/api/auth/login/route.ts` 原本的寫法：

```ts
// ❌ 錯誤寫法
const session = await getSession(); // 使用 next/headers 的 cookies() store
session.codeVerifier = codeVerifier;
session.state = state;
await session.save(); // 寫入內部 cookie store
return NextResponse.redirect(redirectUrl); // 全新的 Response 物件，沒有 Set-Cookie ❌
```

`getSession()` 內部呼叫 `cookies()` from `next/headers`，這是 Next.js 管理的「內部 cookie store」。  
`session.save()` 把 Set-Cookie 寫入這個內部 store，**但 `NextResponse.redirect()` 建立的是一個全新的 Response 物件，不會自動合併內部 store 的 Set-Cookie**。  
結果：瀏覽器收到 redirect 但沒有 Set-Cookie → cookie 永遠不存在。

### 修法

把 session 直接綁定到 redirect response 的 `cookies` 物件上：

```ts
// ✅ 正確寫法（app/api/auth/login/route.ts）
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export async function GET(req: Request) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const redirectUrl = `${keycloakUrls.authEndpoint}?${params}`;
  const response = NextResponse.redirect(redirectUrl);

  // 直接把 session 寫入 redirect response 的 cookies，確保 Set-Cookie header 存在
  const session = await getIronSession<SessionData>(
    response.cookies,
    sessionOptions,
  );
  session.codeVerifier = codeVerifier;
  session.state = state;
  await session.save();

  return response; // response 已帶 Set-Cookie ✅
}
```

> **關鍵原則**：`getIronSession(response.cookies, ...)` 會把 cookie 寫進該 response 物件的 headers，`getIronSession(cookieStore, ...)` 則寫進 Next.js 內部 store（只對同一 request 的 response 生效，對手動建立的 redirect Response 無效）。

---

## 問題十六：Session cookie 超過 4KB 瀏覽器限制

### 症狀

Callback route log：

```
[callback] token exchange error: iron-session: Cookie length is too big (4279 bytes),
browsers will refuse it. Try to remove some data.
```

Token exchange 成功，但 `session.save()` 失敗，session 無法儲存，使用者被 redirect 回 `/login`。

### 根本原因

`iron-session` 將所有 session 資料加密後存成單一 cookie。session 中同時存放三個 JWT：

| 欄位               | 大小（約）  |
| ------------------ | ----------- |
| `accessToken`      | ~1.8 KB     |
| `refreshToken`     | ~1.2 KB     |
| `idToken`          | ~1.3 KB     |
| **合計（加密後）** | **~4.3 KB** |

瀏覽器對單一 cookie 的大小上限為 **4096 bytes**，超過後拒絕儲存。

### 修法

`idToken` 只用於 RP-initiated logout 的 `id_token_hint` 參數（非必要）。移除 `idToken` 的儲存，節省 ~1.3 KB：

```ts
// app/api/auth/callback/route.ts
session.accessToken = tokens.access_token;
session.refreshToken = tokens.refresh_token;
// ❌ 移除：session.idToken = tokens.id_token  (會讓 cookie 超過 4KB)
session.expiresAt = now + tokens.expires_in;
```

```ts
// app/api/auth/logout/route.ts — 移除 id_token_hint（無 idToken 可用）
const params = new URLSearchParams({
  client_id: keycloakConfig.clientId,
  post_logout_redirect_uri: `${process.env.NEXTJS_URL}/login`,
  // ❌ 移除：id_token_hint（Keycloak 沒有此參數仍可正常登出）
});
```

---

## 問題十七：`AbortSignal.timeout()` 模組層級常數導致所有 fetch 逾時

### 症狀

服務啟動後前幾秒 token exchange 成功，之後永遠失敗：

```
[callback] token exchange error: The operation was aborted due to timeout
```

### 根本原因

`lib/token-exchange.ts` 將 fetch options 定義為**模組層級常數**：

```ts
// ❌ 錯誤：模組載入時建立，5 秒後 signal 已 aborted，永遠無法再用
const FETCH_OPTS = {
  method: "POST",
  signal: AbortSignal.timeout(5000), // ← 模組 import 時計時開始，5s 後觸發
};
```

`AbortSignal.timeout(5000)` 在模組被 import 的那一刻開始計時。5 秒後 signal 進入 aborted 狀態，**並永久保持 aborted**。之後的所有 `fetch(url, { ...FETCH_OPTS })` 呼叫都會立刻因為 signal 已 aborted 而丟出 `AbortError`。

### 修法

改為每次呼叫時建立新的 `AbortSignal`：

```ts
// ✅ 正確：每次呼叫時建立，確保每個 fetch 都有全新的 5 秒計時
const fetchOpts = () => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  signal: AbortSignal.timeout(5000),
});

// 使用時：
const res = await fetch(url, { ...fetchOpts(), body: params.toString() });
```

> **通用規則**：任何帶有生命週期的物件（`AbortSignal`、`AbortController`、`ReadableStream` 等）都**不能**定義為模組層級常數，必須在每次使用時重新建立。

---

## 問題十八：Dashboard 顯示 `Welcome,`（username 空白）

### 症狀

成功登入後跳到 `/dashboard`，但顯示：

```
Welcome,          ← username 空白
Roles: admin
```

### 根本原因

`auth-guard.ts` 從 JWT payload 取 `payload.preferred_username`，但 `hospital` realm 的 `nextjs-bff` client **沒有對應的 protocol mapper**，所以 access token 裡根本沒有 `preferred_username` claim。

診斷：查看 client 的 mappers：

```sh
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://keycloak:8080/admin/realms/hospital/clients/$CLIENT_UUID/protocol-mappers/models" \
  | grep '"name"'
# 結果：只有 "audience-mapper"，沒有 username mapper
```

查看 assigned default scopes：

```sh
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://keycloak:8080/admin/realms/hospital/clients/$CLIENT_UUID/default-client-scopes" \
  | grep '"name"'
# 結果：只有 "roles"，hospital realm 沒有建立 openid/profile scope
```

### 修法

為 `nextjs-bff` client 新增 `preferred_username` protocol mapper：

```sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "http://keycloak:8080/admin/realms/hospital/clients/$CLIENT_UUID/protocol-mappers/models" \
  -d '{
    "name": "username",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-property-mapper",
    "consentRequired": false,
    "config": {
      "user.attribute": "username",
      "claim.name": "preferred_username",
      "access.token.claim": "true",
      "id.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }'
```

永久修法：加入 `k8s/keycloak-realm-config.dev.json` 的 `protocolMappers` 陣列，避免重建環境時重複手動設定。

---

## 最終架構說明

```
瀏覽器
  │
  ├── https://...-3000.app.github.dev  (Dev Tunnels)
  │       │
  │       └── app container localhost:3000  → Next.js (npm run dev)
  │
  └── https://...-8080.app.github.dev  (Dev Tunnels)
          │
          └── app container localhost:8080  → nginx
                  │  (加入 X-Forwarded-* headers)
                  └── keycloak:8080  → Keycloak container
                          │
                          └── postgres:5432  → PostgreSQL container
```

### 關鍵環境變數

| 變數                    | 值                                | 用途                              |
| ----------------------- | --------------------------------- | --------------------------------- |
| `KEYCLOAK_URL`          | `https://...-8080.app.github.dev` | 瀏覽器導向 Keycloak 的 URL        |
| `KEYCLOAK_INTERNAL_URL` | `http://keycloak:8080`            | Server-side token exchange / JWKS |
| `NEXTJS_URL`            | `https://...-3000.app.github.dev` | callback / redirect 建構用        |
| `SESSION_SECRET`        | 64-char hex                       | iron-session 加密 key             |

### OAuth PKCE 登入完整流程

```
1. 瀏覽器 → GET /api/auth/login
2. Server 產生 codeVerifier + state，寫入 response.cookies（hospital_session）
3. Server → 307 redirect → Keycloak /auth?code_challenge=...
4. 使用者輸入帳密，Keycloak 驗證後
5. Keycloak → 302 redirect → /api/auth/callback?code=...&state=...
6. Callback 從 hospital_session cookie 讀取 state/codeVerifier 驗證
7. Server → POST Keycloak /token（internal: http://keycloak:8080）
8. 取得 access_token + refresh_token，儲存到 hospital_session cookie
9. Server → 307 redirect → /dashboard
10. /dashboard → requireAuth() → verifyAccessToken(JWT) → 取 preferred_username + roles
```

---

## 問題四：Next.js 啟動後反覆出現 502（postStartCommand shell 退出導致行程被 kill）

### 症狀

```
HTTP ERROR 502
obscure-orbit-...-3000.app.github.dev 目前無法處理這項要求
```

重啟 Next.js 後短暫恢復，但 VS Code 重新連線或 Codespaces session 中斷後再度發生。

### 根本原因

`devcontainer.json` 的 `postStartCommand` 原本以 `&& npm run dev` **前景執行** Next.js：

```jsonc
// ❌ 錯誤（前景執行，綁定在 postStartCommand 的 shell）
"postStartCommand": "... && cd /workspace && npm run dev"
```

當這個 shell 因 VS Code 重連、session 中斷等原因退出時，會對子行程送出 **SIGHUP**，導致：

```
npm run dev → next-server 收到 SIGHUP → 行程變殭屍 (zombie)
→ port 3000 無人監聽 → nginx proxy_pass 失敗 → 502
```

可用以下指令確認（State 為 `Z` 即殭屍）：

```bash
cat /proc/<PID>/status | grep State
# State: Z (zombie)
```

### 修法

改用 **pm2** 以獨立 daemon 方式啟動 Next.js，使其生命週期與 shell 脫鉤：

```jsonc
// ✅ 正確（pm2 daemon，不受 shell 退出影響）
"postStartCommand": "apk add --no-cache nginx 2>/dev/null; npm install -g pm2 --silent 2>/dev/null; ... && cd /workspace && pm2 delete nextjs 2>/dev/null; pm2 start npm --name nextjs -- run dev && pm2 logs nextjs --lines 0"
```

pm2 以獨立 daemon（`/root/.pm2`）運行，shell 退出後仍持續監聽 port 3000，崩潰時也會自動重啟。

### 常用指令

```bash
pm2 status              # 查看狀態
pm2 logs nextjs         # 查看即時 log
pm2 restart nextjs      # 手動重啟
pm2 logs nextjs --nostream --lines 50  # 查看最近 50 行 log
```

---

## 每次建立新 Codespace 的注意事項

1. `KEYCLOAK_URL` 和 `NEXTJS_URL` 中的 codespace name（`obscure-orbit-...`）**每次都不同**，`setup.sh` 會自動偵測 `$CODESPACE_NAME` 並寫入 `.env.local`
2. `postStartCommand` 的 nginx 設定現在也動態讀取 `$CODESPACE_NAME`，不再硬編碼
3. Keycloak client 的 `redirectUris` 已由 `setup.sh` 的 `postCreateCommand` 自動更新
4. **必須用真實瀏覽器**（非 VS Code Simple Browser）分別完成 port 3000 和 port 8080 的 Dev Tunnels click-through

---

## 問題五：Keycloak Admin API 403 — Service Account 缺少 Client Roles Mapper

### 症狀

使用者管理頁面顯示：
```
載入失敗：List users failed: 403
```

即使已在 Keycloak Admin Console → Clients → `nextjs-bff` → Service accounts roles 中指派 `realm-management → manage-users` 和 `view-users`，仍然 403。

### 根本原因

問題分兩層：

**第一層（角色未出現在 JWT）**

`nextjs-bff` client 的 `roles` scope 只有 `realm-roles-mapper`（對應 `realm_access.roles`），缺少 **client roles protocol mapper**。因此即使 service account DB 中有 `realm-management` 角色，這些角色也不會出現在 JWT 的 `resource_access` 欄位。

**第二層（Admin API 讀取 JWT）**

Keycloak Admin REST API 在驗證 service account 時，讀取的是 JWT token 中的 `resource_access["realm-management"].roles`，而非直接查 DB。`resource_access` 缺失 → 403。

用 Node.js 解碼 token 驗證：
```js
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
// 有問題時：
console.log(payload.resource_access); // undefined
// 修復後：
console.log(payload.resource_access["realm-management"].roles);
// ["manage-realm", "manage-users", "view-users", "query-users", ...]
```

### 修法

需要同時完成兩步：

**步驟 1：指派 realm-management 角色給 service account**

前往 Keycloak Admin Console：
- **Clients → nextjs-bff → Service accounts roles → Assign role**
- Filter by clients → 選 `realm-management`
- 勾選 `manage-users`、`view-users`、`query-users`、`manage-realm` → Assign

**步驟 2：在 nextjs-bff client 新增 Client Roles Protocol Mapper**

前往 **Clients → nextjs-bff → Client scopes → nextjs-bff-dedicated → Configure a new mapper → User Client Role**：

| 欄位 | 值 |
|------|-----|
| Name | `client-roles-mapper` |
| Token Claim Name | `resource_access.${client_id}.roles` |
| Add to access token | ON |
| Multivalued | ON |
| Client ID | （空白，代表所有 clients） |

或使用 Admin API 自動完成（替換 `KEYCLOAK_URL` 與 `REALM`）：

```bash
# 1. 取得 admin token
AT=$(curl -s -X POST http://keycloak:8080/realms/master/protocol/openid-connect/token \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=devpassword123" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. 取得 nextjs-bff client UUID
CLIENT_UUID=$(curl -s -H "Authorization: Bearer $AT" \
  "http://keycloak:8080/admin/realms/hospital/clients?clientId=nextjs-bff" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# 3. 新增 client roles mapper
curl -s -X POST "http://keycloak:8080/admin/realms/hospital/clients/$CLIENT_UUID/protocol-mappers/models" \
  -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  -d '{
    "name":"client-roles-mapper",
    "protocol":"openid-connect",
    "protocolMapper":"oidc-usermodel-client-role-mapper",
    "config":{
      "multivalued":"true",
      "access.token.claim":"true",
      "id.token.claim":"true",
      "claim.name":"resource_access.${client_id}.roles",
      "jsonType.label":"String",
      "usermodel.clientRoleMapping.clientId":""
    }
  }'
```

### 注意

此設定在每次新建 Codespace 時需重新設定（或透過 `k8s/keycloak-realm-config.dev.json` 的 `protocolMappers` 欄位自動匯入）。

---

# Zeabur 雲端部署除錯紀錄

> 環境：Next.js 14 / Keycloak 24 / Zeabur Platform
> 日期：2026-06-04

---

## 問題一：`/admin/users` 載入失敗 — `401 unauthorized_client`

### 症狀

```
Failed to get admin token: 401
{"error":"unauthorized_client","error_description":"Client not enabled to retrieve service account"}
```

### 根本原因

`k8s/keycloak-realm-config.zeabur.json` 的 `nextjs-bff` client 缺少 `"serviceAccountsEnabled": true`，
導致 `client_credentials` grant 被 Keycloak 拒絕。

### 修法

在 `keycloak-realm-config.zeabur.json` 的 `nextjs-bff` client 加入：

```json
"serviceAccountsEnabled": true
```

同時補上 `clientScopeMappings`，確保 realm re-import 後 service account 有正確角色：

```json
"clientScopeMappings": {
  "nextjs-bff": [
    {
      "client": "realm-management",
      "roles": ["manage-users", "view-users"]
    }
  ]
}
```

---

## 問題二：`403 Forbidden` — Service Account token 不含 `resource_access`

### 症狀

`client_credentials` grant 成功取得 token，但呼叫 Keycloak Admin REST API (`/admin/realms/hospital/users`) 仍回傳 403。

### 根本原因診斷

解碼 JWT payload 發現 `resource_access` 欄位完全空白：

```json
{
  "realm_access": {"roles": ["offline_access", "default-roles-hospital", "uma_authorization"]},
  "resource_access": {},
  "scope": "roles"
}
```

即使已正確指派 `realm-management → manage-users, view-users` 角色給 service account，Keycloak 24 的 `client_credentials` token **不會自動帶入 client roles 至 `resource_access`**，即使啟用 `fullScopeAllowed` 也無效。

### 嘗試過但無效的方法

| 方法 | 結果 |
|---|---|
| `POST /users/{sa-id}/role-mappings/clients/{rm-id}` 指派角色 | 角色有指派，但不進 token |
| `POST /clients/{id}/scope-mappings/clients/{rm-id}` 加 scope mapping | 仍不出現在 `resource_access` |
| `fullScopeAllowed: true` | 無效 |
| 建立專用 `nextjs-admin` client | 同樣問題 |

### 根本解法：改用 Master Realm Admin Token

Keycloak master realm admin token 可直接存取任何 realm 的 Admin REST API，不受 `resource_access` 限制。

修改 `lib/keycloak-admin.ts` 的 `getAdminToken()`：

```typescript
// ❌ 原本：client_credentials（Keycloak 24 token 缺 resource_access）
grant_type: "client_credentials",
client_id: keycloakConfig.clientId,
client_secret: keycloakConfig.clientSecret,

// ✅ 修改後：master realm password grant
tokenUrl = `${internalUrl}/realms/master/protocol/openid-connect/token`
grant_type: "password",
client_id: "admin-cli",
username: process.env.KEYCLOAK_ADMIN_USER,
password: process.env.KEYCLOAK_ADMIN_PASSWORD,
```

新增必要環境變數：

```env
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=<keycloak-admin-password>
```

---

## 問題三：根路徑 `/` 回傳 404

### 症狀

訪問 `https://nextjs-his-rbac.zeabur.app/` 顯示：

```
404 — This page could not be found.
```

### 根本原因

`app/page.tsx` 不存在。Middleware 只在**沒有 session** 時重導向至登入；若有 session（或其他邊界情況）通過 middleware，Next.js 找不到根路由頁面。

### 修法

新增 `app/page.tsx`：

```typescript
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
```

---

## 問題四：Keycloak 顯示 `Invalid redirect uri`

### 症狀

訪問應用程式後被重導向至 Keycloak，Keycloak 顯示：

```
We are sorry...
Invalid redirect uri
```

### 根本原因

舊部署（Zeabur 重新部署途中）或瀏覽器殘留舊 session/Cookie 導致的暫時性錯誤。

實際確認：
- Keycloak `nextjs-bff` client 的 `redirectUris` 設定正確（`https://nextjs-his-rbac.zeabur.app/api/auth/callback`）
- App 發出的 `redirect_uri` 完全相符
- 新部署完成後直接測試，Keycloak 正確回傳登入頁面

### 修法

1. 清除瀏覽器對該域名的 Cookie
2. 重新訪問應用程式

---

## Zeabur 部署 GitHub Actions 失敗

### 症狀

每次 push 觸發 GitHub Actions，`Deploy to Zeabur` job 立即失敗：

```
Unable to resolve action zeabur/deploy-action, repository not found
```

### 根本原因

`zeabur/deploy-action@v1` 此 GitHub Action **不存在**（repository not found）。

### 修法

移除 `.github/workflows/deploy-zeabur.yml`，改用 **Zeabur Dashboard 原生 Git 整合**：

Zeabur Dashboard → Service → 設定 → 來源 → GitHub 儲存庫 → 選擇 `main` 分支 → 儲存並重新部署

之後每次 `git push origin main` 即自動觸發 Zeabur 部署，不需要 GitHub Actions。

---

## 問題六：編輯使用者回傳 `Unexpected end of JSON input`

### 症狀

編輯使用者並點「儲存」後，Modal 顯示錯誤：

```
Unexpected end of JSON input
```

### 根本原因

兩個問題同時存在：

1. **缺少 `export const dynamic = "force-dynamic"`**：`app/api/bff/users/route.ts` 和 `app/api/bff/users/[id]/route.ts` 沒有加此指令，其他 BFF route 都有。在 Next.js standalone build 中可能導致非預期的靜態處理行為。

2. **`res.json()` 無防禦性呼叫**：`UsersClient.tsx` 的 `handleUpdate`、`handleCreate`、`handleDelete` 在 `await res.json()` 前未確認 response body 是否為 JSON，當 response 為空（如 session 過期 redirect 後的空 body）時會爆 `Unexpected end of JSON input`。

### 修法

**Route 檔補上 `force-dynamic`：**

```typescript
// app/api/bff/users/route.ts
// app/api/bff/users/[id]/route.ts
export const dynamic = "force-dynamic";
```

**Client 端改用防禦性 JSON 解析：**

```typescript
// ❌ 原本
const data = await res.json();
if (!res.ok) throw new Error(data.error ?? "更新失敗");

// ✅ 修改後
const text = await res.text();
const data: Record<string, unknown> = text ? JSON.parse(text) : {};
if (!res.ok) throw new Error((data.error as string) ?? `更新失敗 (${res.status})`);
```

---

## 問題七：Sign-out 後顯示空白頁（Keycloak logout 無 redirect）

### 症狀

點 sign-out 按鈕後，瀏覽器導向 Keycloak 登出 URL，頁面空白，沒有導回 `/login`。

```
https://keycloak-xxx.zeabur.app/realms/hospital/protocol/openid-connect/logout?
  client_id=nextjs-bff&post_logout_redirect_uri=https://app.zeabur.app/login
```

### 根本原因

Keycloak 18+ 的 OIDC RP-Initiated Logout 若沒有 `id_token_hint`，不保證執行 redirect。空白頁是 Keycloak 在沒有 hint 的情況下的預設行為。

目前 `id_token` 沒有存入 session（避免超過 4KB Cookie 限制），所以無法傳 `id_token_hint`。

### 嘗試過但無效的方法

在 `post.logout.redirect.uris` 加入 `/login` URL → Keycloak 仍顯示空白頁（因為沒有 `id_token_hint`）。

### 根本解法：Backchannel Logout

不依賴 Keycloak 的前端 redirect，改為：

1. Server-side 用 `refresh_token` 呼叫 `POST /realms/{realm}/protocol/openid-connect/logout`（Keycloak backchannel）
2. 直接把瀏覽器導向 `/login`

```typescript
// app/api/auth/logout/route.ts
export async function GET(req: NextRequest) {
  const session = await getSession()
  const refreshToken = session.refreshToken
  await session.destroy()                        // 1. 先清除 local session

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
    }).catch(() => {})                           // 2. fire-and-forget 終止 Keycloak SSO session
  }

  return NextResponse.redirect(new URL('/login', process.env.NEXTJS_URL ?? req.url))  // 3. 直接跳 /login
}
```

**優點：**
- 不需要 `id_token_hint`
- 瀏覽器永遠導回 `/login`，不依賴 Keycloak redirect 行為
- Keycloak SSO session 仍然被正確終止

---

## 問題八：登出後重新登入無法切換帳號

### 症狀

點「Sign in with Keycloak」後，Keycloak 不顯示登入表單，直接以原帳號自動登入。

### 根本原因

Backchannel logout（`POST /logout` with `refresh_token`）在某些情況下未完全終止 Keycloak 瀏覽器端 SSO session cookie。Keycloak 偵測到 browser session 仍存在，跳過登入表單直接 SSO 登入。

### 修法

在 `/api/auth/login` 的授權 URL 加入 `prompt=login`，強制 Keycloak 每次都顯示登入表單：

```typescript
// app/api/auth/login/route.ts
const params = new URLSearchParams({
  response_type: "code",
  client_id: keycloakConfig.clientId,
  redirect_uri: keycloakConfig.redirectUri,
  scope: "openid",
  state,
  code_challenge: codeChallenge,
  code_challenge_method: "S256",
  prompt: "login",               // ← 強制顯示登入表單
});
```

---

## Keycloak Realm Config 套用方式（Zeabur）

修改 `k8s/keycloak-realm-config.zeabur.json` 後，透過 Admin REST API 直接套用而不需重新 import realm：

```powershell
# 取得 admin token
$r = Invoke-RestMethod "https://<keycloak-url>/realms/master/protocol/openid-connect/token" `
  -Method POST -ContentType "application/x-www-form-urlencoded" `
  -Body "grant_type=password&client_id=admin-cli&username=admin&password=<password>"
$headers = @{ Authorization = "Bearer $($r.access_token)" }

# 取得 client UUID
$clients = Invoke-RestMethod ".../admin/realms/hospital/clients?clientId=nextjs-bff" -Headers $headers
$uuid = $clients[0].id

# 更新 client（PUT 整個 client JSON）
$client = Invoke-RestMethod ".../admin/realms/hospital/clients/$uuid" -Headers $headers
$client.serviceAccountsEnabled = $true
Invoke-RestMethod ".../admin/realms/hospital/clients/$uuid" -Method PUT -Headers $headers `
  -ContentType "application/json" -Body ($client | ConvertTo-Json -Depth 10)
```
