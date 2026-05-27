# Hospital Realm — 測試帳號

> **環境**：Keycloak `hospital` realm（Dev / Codespace）  
> ⚠️ 僅供測試使用，請勿用於正式環境

## 測試帳號列表

| 帳號          | 密碼          | 角色     | 說明                                    |
| ------------- | ------------- | -------- | --------------------------------------- |
| `admin-user`  | `Admin@1234`  | `admin`  | 管理員，登入後直接跳轉到使用者管理 CRUD |
| `doctor-user` | `Doctor@1234` | `doctor` | 醫師，可查看病患資料                    |
| `nurse-user`  | `Nurse@1234`  | `nurse`  | 護理師，可查看與更新病患資料            |
| `viewer-user` | `Viewer@1234` | `viewer` | 唯讀，只能瀏覽資訊                      |

## 登入流程

1. 前往 `https://<codespace-name>-3000.app.github.dev/`
2. 點擊「登入」，跳轉至 Keycloak 登入頁
3. 輸入上方帳號/密碼
4. **admin-user** 登入後自動導向 `/admin/users`（使用者管理頁）
5. 其他角色登入後導向 `/dashboard`

## 角色權限說明

| 角色     | 權限                                 |
| -------- | ------------------------------------ |
| `admin`  | 使用者管理（CRUD）、所有功能         |
| `doctor` | 查看病患列表、病患詳情               |
| `nurse`  | 查看病患列表、病患詳情、更新護理紀錄 |
| `viewer` | 唯讀瀏覽                             |

## Keycloak Admin Console

| 項目  | 值                                                   |
| ----- | ---------------------------------------------------- |
| URL   | `https://<codespace-name>-8080.app.github.dev/admin` |
| 帳號  | `admin`                                              |
| 密碼  | `devpassword123`                                     |
| Realm | `hospital`                                           |
