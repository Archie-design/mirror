## MODIFIED Requirements

### Requirement: Admin Session 認證

管理員身份 SHALL 透過獨立 cookie session（不同於學員 session）認證，主要以 LINE 帳號登入：

1. 前端顯示「以 LINE 帳號登入」按鈕，導向 `/api/auth/line?action=admin_login`
2. LINE OAuth callback 驗證 `CharacterStats.IsAdmin = true`（詳見 admin-identity spec）
3. 通過 → 設定 HttpOnly cookie `admin_session`，TTL 30 分鐘
4. 所有 admin server actions MUST 先呼叫 `verifyAdminSession()` 驗證（邏輯不變）

備用登入方式（緊急用）：登入頁提供收合的「緊急備用入口」，展開後可輸入 `ADMIN_PASSWORD` 密碼，邏輯與原有相同。

token 採 HMAC（`AUTH_SESSION_SECRET` 簽章），production 強制此 env 設定。token 計算邏輯集中於 `lib/admin-token.ts`，供 `admin-auth.ts` 與 callback route 共用。

#### Scenario: LINE 登入成功（IsAdmin=true）

- **WHEN** `IsAdmin=true` 的管理員點擊「以 LINE 帳號登入」並完成 LINE 授權
- **THEN** cookie `admin_session` 設定 30 分鐘、後台自動開啟

#### Scenario: LINE 登入被拒（IsAdmin=false）

- **WHEN** `IsAdmin=false` 的帳號嘗試 LINE 登入管理後台
- **THEN** 系統 redirect 含 `reason=not_admin` 參數、前端顯示「此帳號無管理員權限」

#### Scenario: 密碼緊急備用登入

- **WHEN** 管理員點擊「緊急備用入口」展開密碼欄並輸入正確 ADMIN_PASSWORD
- **THEN** cookie `admin_session` 設定 30 分鐘、進入後台

#### Scenario: 密碼錯誤（備用入口）

- **WHEN** 管理員透過備用入口輸入錯誤密碼
- **THEN** 系統回 `{ success: false, error: 'invalid' }`，cookie 不設

#### Scenario: 缺 AUTH_SESSION_SECRET（production）

- **WHEN** production 環境未設 AUTH_SESSION_SECRET、管理員嘗試登入
- **THEN** server throw 並回 500，避免使用弱簽章
