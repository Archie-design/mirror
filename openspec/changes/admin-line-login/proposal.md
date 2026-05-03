## Why

管理員後台目前以單一共享密碼登入，無法識別操作者身份、不支援多管理員，且密碼機制難以安全地在團隊間共享。改以 LINE 帳號登入，可綁定個人身份、操作日誌可追蹤執行者，並在後台提供指定管理員的工具，讓系統管理可多人協作。

## What Changes

- **管理員登入方式**：密碼輸入表單改為「以 LINE 帳號登入」按鈕；走現有 LINE OAuth flow，但 callback 改為驗證 `CharacterStats.IsAdmin = true`，通過後設定 `admin_session` cookie（TTL 維持 30 分鐘）。密碼登入保留為收合的「緊急備用入口」，供 LINE 服務中斷時使用。
- **管理員身份欄位**：`CharacterStats` 新增 `IsAdmin BOOLEAN DEFAULT false` 欄位，作為管理員資格的資料庫來源。
- **指定管理員 UI**：後台 Tab I 成員列表中，每個成員可授予或撤銷 `IsAdmin`，透過 `setMemberAdminStatus()` server action 更新並寫入操作日誌。條件限制：被設為管理員的學員必須已綁定 LINE（有 `LineUserId`），否則無法登入。
- **LINE OAuth state 擴充**：`LineState` 型別新增 `'admin_login'` action；callback 加對應 branch。
- **共用 token 計算模組**：抽出 `lib/admin-token.ts`，讓 `admin-auth.ts`（server action）與 callback API route 共用相同 HMAC 邏輯，不重複。

## Capabilities

### New Capabilities

- `admin-identity`: 管理員身份的 DB 欄位、授予/撤銷操作、LINE 登入驗證流程（含 callback 的 admin_login branch）

### Modified Capabilities

- `admin-console`: Admin Session 認證 requirement 更新——主要登入方式改為 LINE，密碼改為備用；新增學員可被指定為管理員

## Impact

- **新增 DB 欄位**：`CharacterStats.IsAdmin`（需 migration）
- **新增檔案**：`lib/admin-token.ts`、`supabase/migrations/202505030001_add_is_admin_column.sql`
- **修改 API Route**：`app/api/auth/line/route.ts`、`app/api/auth/line/callback/route.ts`
- **修改 Server Actions**：`app/actions/admin-auth.ts`（refactor）、`app/actions/admin.ts`（新增 setMemberAdminStatus、listAllMembers 加 IsAdmin）
- **修改 UI**：`components/Admin/AdminDashboard.tsx`（登入表單 + Tab I toggle）、`app/page.tsx`（處理 `?admin_auth=` callback 參數）
- **型別**：`types/index.ts` 加 `IsAdmin?`
- **依賴不變**：LINE OAuth 的 channel ID/secret 沿用現有 env vars；`verifyAdminSession()` 邏輯不動
