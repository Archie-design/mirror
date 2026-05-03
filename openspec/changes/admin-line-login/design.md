## Context

管理員後台（大法師密室）目前以單一環境變數密碼（`ADMIN_PASSWORD`）認證，無身份追蹤。登入 flow：`loginAdmin(password)` → 比對 → 設 `admin_session` cookie（HMAC token，30 分鐘 TTL）。

`verifyAdminSession()` 在每個 admin server action 開頭驗證 cookie，邏輯簡單穩固，本次**不改動**。

系統已有完整 LINE OAuth flow 供一般學員登入（`/api/auth/line`、callback route、`lib/auth.ts` 的簽章工具），本次擴充此 flow 而非另起爐灶。

關鍵約束：`admin-auth.ts` 帶 `'use server'` + `server-only`，API Route（callback）無法直接 import。

## Goals / Non-Goals

**Goals:**
- 管理員可用 LINE 帳號登入後台，身份對應 `CharacterStats.IsAdmin = true`
- 後台可搜尋學員並授予/撤銷 `IsAdmin` flag
- 保留密碼作為緊急備用（收合 UI）
- `admin_session` cookie 機制、TTL、`verifyAdminSession()` 完全不變

**Non-Goals:**
- TOTP / 多因素認證
- 管理員角色分級（admin vs super-admin）
- LINE 登入後的 session 延長（仍為 30 分鐘）

## Decisions

### Decision 1：共用 token 計算抽出至 `lib/admin-token.ts`

**問題**：callback API Route 需計算相同的 HMAC admin token，但無法 import `admin-auth.ts`（`server-only`）。

**選項 A**：在 callback 內複製 4 行 HMAC 邏輯（DRY 輕微違背）  
**選項 B**：抽出 `lib/admin-token.ts`（無 directive，純 Node.js 計算）

**決定：B**。因為 token label / TTL 是可能被修改的常數，兩處重複定義易產生不一致。共用模組可確保 `admin-auth.ts`、callback route 永遠使用同一套計算。

---

### Decision 2：管理員 identity 欄位放在 `CharacterStats.IsAdmin`，不另建表

**問題**：管理員 identity 存哪？

**選項 A**：新建 `AdminUsers` 表（lineUserId, name, ...）  
**選項 B**：`CharacterStats` 加 `IsAdmin BOOLEAN DEFAULT false`  
**選項 C**：`SystemSettings` 存管理員 userID 陣列  

**決定：B**。現有角色旗標（`IsCaptain`, `IsCommandant`, `IsGM`）都在 CharacterStats，設計一致。管理員必然是學員（有帳號），不需獨立 user table。C 方案型別不安全且 upsert 邏輯複雜。

---

### Decision 3：LINE admin_login 使用相同 callback URL，action 放 HMAC state 中

**問題**：admin_login 要用同一個 callback route 還是另起 `/api/auth/admin/callback`？

**決定：同一個 callback route**。state payload 已有 HMAC 簽章防偽造，加入 `action: 'admin_login'` 即可在 callback 內分派；LINE Developer Console callback URL 無需修改。

---

### Decision 4：`?admin_auth=1` callback 觸發現有 view useEffect

**問題**：LINE OAuth 完成後如何開啟後台？

Page.tsx 已有 useEffect：`if (view !== 'admin' || adminAuth) return; verifyAdminSession() → setAdminAuth(true)`。  
**決定**：callback redirect 到 `/?admin_auth=1`，page.tsx 偵測後只需呼叫 `setView('admin')`，現有 useEffect 自動完成驗證和資料載入，零重複邏輯。

---

### Decision 5：設為管理員需先綁定 LINE（server 強制）

**問題**：若學員 IsAdmin=true 但無 LineUserId，可登入後台嗎？

**決定**：`setMemberAdminStatus(userId, true)` 在 server action 檢查 `LineUserId`，若空則拒絕，回 `{ success: false, error: '此成員尚未綁定 LINE 帳號' }`。UI 亦顯示警告。這避免「管理員設了卻無法登入」的懸空狀態。

## Risks / Trade-offs

- **LINE 服務中斷 → 無法登入**：密碼備用入口緩解，但需確保 ADMIN_PASSWORD 持續設置。
- **自我降權**：管理員可撤銷自己的 IsAdmin，導致無法再登入。此版本記錄 AdminLog 可追蹤，但未阻止操作；後續可加保護。
- **首次部署需手動設第一個管理員**：需透過 Supabase dashboard 或 SQL 手動 `UPDATE CharacterStats SET IsAdmin=true WHERE UserID='<phone>'`。這是刻意設計（bootstrap 問題），文件化即可。

## Migration Plan

1. 執行 DB migration（加 `IsAdmin` 欄位）
2. 手動將第一位管理員的 CharacterStats.IsAdmin 設為 true（透過 Supabase dashboard）
3. 部署新版本
4. 管理員用 LINE 帳號登入驗證
5. 進入後台後可用 Tab I 指定其他管理員

**Rollback**：恢復舊版本後密碼登入立即可用（cookie 機制不變）；IsAdmin 欄位保留無害。

## Open Questions

- 是否在 Tab I 顯示 `IsAdmin` 欄位於匯出 CSV？（目前傾向不包含，避免暴露管理員名單）
