# 管理員身份（admin-identity）

## ADDED Requirements

### Requirement: IsAdmin 欄位與資格條件

`CharacterStats` 表 SHALL 包含 `IsAdmin BOOLEAN NOT NULL DEFAULT false` 欄位，作為是否可登入管理後台的資料庫依據。

被設為管理員的學員 MUST 已完成 LINE 帳號綁定（`LineUserId` 非空），否則系統 SHALL 拒絕授予，回傳 `{ success: false, error: '此成員尚未綁定 LINE 帳號，無法設為管理員' }`。

#### Scenario: 授予管理員（已綁定 LINE）

- **WHEN** 管理員對已綁定 LINE 的學員呼叫 `setMemberAdminStatus(userId, true)`
- **THEN** 系統將該學員 `IsAdmin` 設為 `true`
- **AND** `AdminActivityLog` 寫入 `action='set_member_admin'`

#### Scenario: 授予管理員（未綁定 LINE）

- **WHEN** 管理員對尚未綁定 LINE 的學員呼叫 `setMemberAdminStatus(userId, true)`
- **THEN** 系統回傳 `{ success: false, error: '此成員尚未綁定 LINE 帳號，無法設為管理員' }`
- **AND** `IsAdmin` 欄位不改變

#### Scenario: 撤銷管理員

- **WHEN** 管理員呼叫 `setMemberAdminStatus(userId, false)`
- **THEN** 系統將該學員 `IsAdmin` 設為 `false`
- **AND** `AdminActivityLog` 寫入 `action='set_member_admin'`

---

### Requirement: 管理員 LINE 登入流程

系統 SHALL 支援以 LINE 帳號登入管理後台，流程如下：

1. 前端導向 `/api/auth/line?action=admin_login`
2. LINE OAuth 完成後，callback 以 `lineUserId` 查詢 `CharacterStats`
3. 若找不到對應學員 → redirect `/?admin_auth=error&reason=not_bound`
4. 若找到但 `IsAdmin = false` → redirect `/?admin_auth=error&reason=not_admin`
5. 若 `IsAdmin = true` → 設定 `admin_session` cookie（與密碼登入完全相同的 HMAC token）→ redirect `/?admin_auth=1`

`admin_session` cookie TTL SHALL 為 30 分鐘，`secure: true`（production），`httpOnly: true`。

#### Scenario: LINE 帳號為管理員

- **WHEN** `IsAdmin=true` 且已綁定 LINE 的學員點擊「以 LINE 登入」按鈕
- **THEN** LINE OAuth 完成後設定 `admin_session` cookie
- **AND** 瀏覽器跳轉至 `/?admin_auth=1`，後台自動開啟

#### Scenario: LINE 帳號不是管理員

- **WHEN** `IsAdmin=false` 的學員嘗試以 LINE 登入管理後台
- **THEN** callback redirect 至 `/?admin_auth=error&reason=not_admin`
- **AND** 前端顯示「此帳號無管理員權限」錯誤訊息

#### Scenario: LINE 帳號未綁定任何學員

- **WHEN** 未綁定任何帳號的 LINE 帳號嘗試管理員登入
- **THEN** callback redirect 至 `/?admin_auth=error&reason=not_bound`
- **AND** 前端顯示「此 LINE 帳號尚未綁定任何學員帳號」錯誤訊息

---

### Requirement: 指定管理員 UI

管理後台 Tab I（學員名冊管理）SHALL 提供以下管理員管理功能：

- 顯示已設為管理員的學員「管理員」badge
- 每個學員 row 提供授予/撤銷管理員按鈕，點擊後顯示確認 dialog
- 確認 dialog MUST 列出操作對象姓名與操作類型（授予/撤銷）
- 若目標學員未綁定 LINE 且要授予，UI MUST 顯示警告提示

#### Scenario: 從 Tab I 授予管理員

- **WHEN** 管理員在 Tab I 找到某學員、點擊「設為管理員」並確認
- **THEN** 呼叫 `setMemberAdminStatus(userId, true)`，成功後學員 row 出現「管理員」badge

#### Scenario: 未綁定 LINE 的學員顯示警告

- **WHEN** 管理員對未綁定 LINE 的學員點擊「設為管理員」
- **THEN** 確認 dialog 顯示「⚠ 此成員尚未綁定 LINE，授予後仍無法以 LINE 登入後台」警告
