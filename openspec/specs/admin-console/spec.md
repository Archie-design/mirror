# 管理後台（admin-console）

## Purpose

定義管理員後台的功能範圍、authentication、各 Tab 的職責邊界，以及操作日誌、CSV 匯入/匯出、系統設定的不可繞過約束。

> 來源：[docs/GAME_DESIGN.md §6](../../../docs/GAME_DESIGN.md)、[docs/FEATURE_AUDIT_2026_05.md IV-1 ~ IV-7](../../../docs/FEATURE_AUDIT_2026_05.md)

## Requirements

### Requirement: Admin Session 認證

管理員身份 SHALL 透過獨立 cookie session（不同於學員 session）認證：

1. POST 密碼到 `loginAdmin(password)`
2. 比對 `process.env.ADMIN_PASSWORD`（dev 環境若未設則 fallback 為 `"123"`）
3. 通過 → 設定 HttpOnly cookie `admin_session`，TTL 30 分鐘
4. 所有 admin server actions MUST 先呼叫 `verifyAdminSession()` 驗證

token 採 HMAC（`AUTH_SESSION_SECRET` 簽章），production 強制此 env 設定。

#### Scenario: 密碼正確

- **WHEN** 管理員輸入正確的 ADMIN_PASSWORD
- **THEN** cookie `admin_session` 設定 30 分鐘、進入後台

#### Scenario: 密碼錯誤

- **WHEN** 管理員輸入錯誤密碼
- **THEN** 系統回 `{ success: false, error: 'invalid' }`，cookie 不設

#### Scenario: 缺 AUTH_SESSION_SECRET（production）

- **WHEN** production 環境未設 AUTH_SESSION_SECRET、管理員嘗試登入
- **THEN** server throw 並回 500，避免使用弱簽章

---

### Requirement: 成員管理（Tab I）

管理員 SHALL 可：

- **批量匯入名冊**：貼 CSV → `importRostersData`，詳見 [auth-and-roster](../auth-and-roster/spec.md)
- **列出全部成員**：`listAllMembers()`，含 UserID/Name/SquadName/TeamName/角色/Score/Streak
- **轉隊**：`transferMember(targetUserId, newSquadName, newTeamName)`
- **設定角色**：`setMemberRole(targetUserId, { isCaptain?, isCommandant?, isGM? })`
- **刪除成員**：`deleteMember(targetUserId)`，**會清空相關資料**：CharacterStats、DailyLogs、BonusApplications、CourseRegistrations、UserNineGrid、Rosters
- **匯出成員分數 CSV**：`exportMemberScoresCsv()`，UTF-8 BOM
- **查看活躍度統計**：`getMemberActivityStats()`
- **清除測試帳號**：`purgeTestAccounts()`，批次刪除所有 UserID 不符合 `^[0-9]{9}$` 的帳號；操作前顯示待刪清單供確認

每筆操作 MUST 寫入 `AdminLogs`。

#### Scenario: 刪除成員清空資料

- **WHEN** 管理員刪除學員 X（UserID=912345678）
- **THEN** CharacterStats、DailyLogs、Rosters、BonusApplications、CourseRegistrations、UserNineGrid 中 X 的所有紀錄清空、AdminLogs 新增一筆

#### Scenario: 轉隊

- **WHEN** 管理員把學員 X 從第1小隊轉到第2小隊
- **THEN** CharacterStats.SquadName/TeamName 更新、Rosters 同步、AdminLogs 寫入

#### Scenario: 清除測試帳號需確認

- **WHEN** 管理員點擊「清除測試帳號」按鈕
- **THEN** UI 顯示待刪帳號清單（UserID + Name）及「此操作不可撤銷」警告；管理員按「確認刪除」後執行 `purgeTestAccounts()`

---

### Requirement: 任務管理（Tab II）

管理員 SHALL 可：

- **定課分值調整**：修改 `SystemSettings.QuestRewardOverrides[questId]`，即時生效
- **定課啟停**：管理 `SystemSettings.DisabledQuests` 陣列
- **臨時加碼任務**：管理 `temporaryquests` 表（INSERT/UPDATE active flag/DELETE）
- **學員打臨時任務**：直接入帳（無需審核）

#### Scenario: 調整 d1 分值

- **WHEN** 管理員把 d1 從 20 調到 30
- **THEN** SystemSettings.QuestRewardOverrides 更新、即時下次學員打 d1 = +30

#### Scenario: 停用 p4

- **WHEN** 管理員把 p4 加入 DisabledQuests
- **THEN** 學員端 p4 卡片變灰、嘗試打 p4 server 拒絕

---

### Requirement: 審核管理（Tab III）

管理員 SHALL 可：

- **二級審核（一次性任務）**：覆蓋大隊長角色，所有 squad_approved 申請可由管理員終審
- **大隊長批次審核工具**：`bulkReviewBonusByAdmin(appIds, approve, notes?)`
- **看到全大隊申請**：不像大隊長僅限本大隊

#### Scenario: 批次核准

- **WHEN** 管理員選 5 筆 squad_approved 的 o3 申請、按批次核准
- **THEN** 5 筆 status='approved'、5 位學員各 +500、AdminLogs 寫一筆批次紀錄

---

### Requirement: 九宮格模板（Tab IV）

管理員 SHALL 可編輯五份公版九宮格模板（每份 9 格 + cell_score）：

- 修改 cell label / description
- 調整 cell_score
- 變更不影響既有 UserNineGrid（學員端為快照）

#### Scenario: 修改小桃模板

- **WHEN** 管理員修改體能運模板格 5 的描述
- **THEN** 既有體能運使用者的 UserNineGrid 不變、新註冊體能運者套用新版

---

### Requirement: 系統設定（Tab V）

管理員 SHALL 可設定 `SystemSettings`：

- `RegistrationMode`：`'open'`（自由註冊）/ `'roster'`（名冊驗證）
- `VolunteerPassword`
- `Announcements[]`：全站公告陣列（newest first）
- `CourseEvents[]`：課程場次陣列

`updateGlobalSetting(key, value)` MUST 用 UPSERT (`onConflict='SettingName'`)，新 key 自動建立。

#### Scenario: 加新公告

- **WHEN** 管理員提交新公告文字
- **THEN** Announcements 陣列前插一筆、學員端橫幅即時出現

#### Scenario: 刪除公告

- **WHEN** 管理員刪某筆公告
- **THEN** 該筆 ID 從陣列移除、學員端橫幅消失

---

### Requirement: 課程場次管理（Tab VI）

管理員 SHALL 可在 `SystemSettings.CourseEvents` 陣列中新增 / 編輯 / 啟停 / 刪除課程場次，詳見 [course-events](../course-events/spec.md)。

#### Scenario: 新增課程

- **WHEN** 管理員新增「2026-06-23 慶典」場次
- **THEN** SystemSettings.CourseEvents 多一筆、學員「親證曆」自動出現該卡片

---

### Requirement: 操作日誌（AdminLogs）

所有管理員寫入操作 MUST 寫一筆 `AdminLogs`，含：

| 欄位 | 內容 |
|------|------|
| `action` | 操作類型字串（roster_import / member_transfer / fine_compliance / ...） |
| `actor` | 操作者識別（多為 'admin'） |
| `target_id` / `target_name` | 操作對象 |
| `details` | JSON 細節 |
| `result` | 'success' / 'error' |
| `created_at` | 時間戳 |

`AdminLogs` 表 SHALL 不可由前端讀寫，僅 server actions（admin scope）可寫；管理員 UI 提供查詢介面。

#### Scenario: 操作失敗也寫日誌

- **WHEN** 管理員某操作 throw error
- **THEN** AdminLogs 寫一筆 `result='error'`、details 含錯誤訊息

---

### Requirement: 排行榜快照（Cron）

系統 SHALL 透過 Vercel Cron 定期寫入排行榜快照，不需管理員手動觸發：

- `/api/cron/weekly-snapshot`：週日 16:30 UTC
- `/api/cron/monthly-snapshot`：每月 1 日 16:30 UTC

兩支 endpoint MUST 驗證 `Authorization: Bearer <CRON_SECRET>` header，否則回 401。

#### Scenario: 缺 CRON_SECRET

- **WHEN** 任意請求未帶 CRON_SECRET 呼叫 cron endpoint
- **THEN** 系統回 401「Unauthorized」、不執行
