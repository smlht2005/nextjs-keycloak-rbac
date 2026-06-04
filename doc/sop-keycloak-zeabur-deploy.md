# SOP：Keycloak 部署到 Zeabur 並與 Next.js 整合

**適用專案**：nextjs-keycloak-rbac  
**最後更新**：2026-06-03

---

## 概覽

```
Zeabur Project: hospital-his
├── Service: keycloak     → https://keycloak-xxx.zeabur.app
└── Service: nextjs-rbac  → https://nextjs-xxx.zeabur.app
```

---

## Step 1：在 Zeabur 新增 Keycloak 服務

1. 開啟 Zeabur Dashboard → 進入你的 Project
2. 點擊 **Add Service** → 選擇 **Marketplace**
3. 搜尋 `Keycloak` → 點擊安裝
4. 服務名稱設為 `keycloak`（與內部 DNS 一致）

---

## Step 2：設定 Keycloak 環境變數

在 Keycloak service → **Variables** 設定：

| 變數名稱 | 值 |
|---|---|
| `KEYCLOAK_ADMIN` | `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | 自訂強密碼（記住它，之後要登入 admin console） |

---

## Step 3：為 Keycloak 分配 Domain

1. Keycloak service → **Networking** → **Public**
2. 點擊 **Generate Domain** 或自訂 domain
3. 記下 domain，例如：`keycloak-hospital.zeabur.app`
4. 等待 Keycloak 啟動（約 1-2 分鐘）

---

## Step 4：準備 Realm Config 並替換佔位符

開啟 `k8s/keycloak-realm-config.zeabur.json`，替換以下兩個佔位符：

```bash
# 在 repo 根目錄執行（替換成實際值）
NEXTJS_DOMAIN="nextjs-rbac.zeabur.app"        # Next.js 的 Zeabur domain
CLIENT_SECRET="$(openssl rand -hex 32)"        # 產生隨機 secret

# macOS/Linux
sed -i "s/REPLACE_NEXTJS_DOMAIN/${NEXTJS_DOMAIN}/g" k8s/keycloak-realm-config.zeabur.json
sed -i "s/REPLACE_CLIENT_SECRET/${CLIENT_SECRET}/g" k8s/keycloak-realm-config.zeabur.json

# Windows PowerShell
(Get-Content k8s\keycloak-realm-config.zeabur.json) `
  -replace 'REPLACE_NEXTJS_DOMAIN', 'nextjs-rbac.zeabur.app' `
  -replace 'REPLACE_CLIENT_SECRET', 'your-generated-secret' |
  Set-Content k8s\keycloak-realm-config.zeabur.json
```

> ⚠️ 替換後的 `CLIENT_SECRET` 值要記下來，後續 Next.js `KEYCLOAK_CLIENT_SECRET` 要填入相同值。

---

## Step 5：匯入 Realm 到 Keycloak

1. 瀏覽器開啟 `https://keycloak-hospital.zeabur.app`
2. 點擊 **Administration Console** → 用 Step 2 的帳密登入
3. 左上角 realm 下拉選單 → **Create realm**
4. 點擊 **Browse** → 上傳 `k8s/keycloak-realm-config.zeabur.json`
5. 點擊 **Create**
6. 確認左上角 realm 已切換為 `hospital`

---

## Step 6：驗證 Client Secret

1. Keycloak Admin Console → realm `hospital`
2. 左側 **Clients** → 點擊 `nextjs-bff`
3. 切換到 **Credentials** 分頁
4. 確認 **Client secret** 與 Step 4 設定的值一致

---

## Step 7：設定 Next.js Service 環境變數

在 Zeabur → `nextjs-rbac` service → **Variables** 填入：

| 變數名稱 | 值 |
|---|---|
| `KEYCLOAK_URL` | `https://keycloak-hospital.zeabur.app` |
| `KEYCLOAK_INTERNAL_URL` | `http://keycloak:8080`（Zeabur 內部 DNS）|
| `KEYCLOAK_REALM` | `hospital` |
| `KEYCLOAK_CLIENT_ID` | `nextjs-bff` |
| `KEYCLOAK_CLIENT_SECRET` | Step 4 產生的 `CLIENT_SECRET` |
| `NEXTJS_URL` | `https://nextjs-rbac.zeabur.app` |
| `SESSION_SECRET` | `759055a26fbc3e97192229f6cf6810c0af3a481a37fcec249cc86632edf4364c` |
| `PATIENT_SERVICE_URL` | 暫時填 `http://localhost:8081`（無真實服務時不影響啟動）|
| `ADMIN_SERVICE_URL` | 暫時填 `http://localhost:8082` |

> **注意**：`KEYCLOAK_INTERNAL_URL` 讓 Next.js server-side（token exchange、JWKS）走 Zeabur 內部網路，避免 DNS 繞外部的延遲。

---

## Step 8：觸發 Next.js 重新部署

設定完 Variables 後，Zeabur 會自動重新部署。或手動：

Zeabur → `nextjs-rbac` service → **Deployments** → **Redeploy**

---

## Step 9：驗收測試

1. 開啟 `https://nextjs-rbac.zeabur.app`
2. 應自動跳轉到 `/login`
3. 點擊 **Sign in with Keycloak** → 跳轉到 Keycloak 登入頁
4. 用測試帳號登入（初次登入需強制變更密碼，因為 `temporary: true`）：

   | 帳號 | 密碼 | 角色 |
   |---|---|---|
   | `admin-user` | `Admin1234!` | admin |
   | `doctor-user` | `Doctor1234!` | doctor |
   | `nurse-user` | `Nurse1234!` | nurse |
   | `viewer-user` | `Viewer1234!` | viewer |

5. 登入成功後應跳轉到 `/dashboard`

---

## 常見問題

| 症狀 | 原因 | 解決方式 |
|---|---|---|
| Keycloak 顯示 `invalid_redirect_uri` | Step 4 的 NEXTJS_DOMAIN 填錯 | Keycloak Admin → Clients → nextjs-bff → Valid redirect URIs 修正 |
| Next.js 顯示 `ECONNREFUSED` 連不到 Keycloak | `KEYCLOAK_INTERNAL_URL` 格式錯誤 | 改用 `KEYCLOAK_URL`（公開 URL）測試，確認後再改回內部 URL |
| Token exchange 失敗 `401 Unauthorized` | `KEYCLOAK_CLIENT_SECRET` 不一致 | 比對 Keycloak Credentials 分頁與 Next.js 環境變數的值 |
| 登入後 session 解密失敗 | `SESSION_SECRET` 不足 32 字元 | 確認 Variables 中的值長度 ≥ 32 |
