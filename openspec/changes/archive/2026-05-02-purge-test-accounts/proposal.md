## Why

系統在開發階段透過 seed scripts 建立了非標準 UserID 的測試帳號（`test_u01`–`test_u20`、`roster_NN_123`），這些帳號不符合 9 位數字手機號規則，若留存於 production 將污染排行榜、罰款計算、活躍度統計等資料。在真實學員開始使用前，管理員需要一個安全的一鍵清除入口。

## What Changes

- 新增 server action `purgeTestAccounts()`：識別並批次刪除所有 UserID 不符合 `^[0-9]{9}$` 的 CharacterStats 及其關聯資料
- 管理後台 Tab I「成員管理」新增「清除測試帳號」按鈕，附帶確認 dialog 顯示待刪帳號清單
- 刪除動作完成後寫一筆批次 AdminLogs（action='purge_test_accounts'）

## Capabilities

### New Capabilities

- `purge-test-accounts`：管理員識別並清除所有非標準 UserID 測試帳號的完整流程，含 server-side 識別邏輯、批次刪除、操作日誌

### Modified Capabilities

- `admin-console`：Tab I 新增「清除測試帳號」操作入口（新增一個 admin action，符合現有 AdminLogs 規範，不變更既有 Requirement）

## Impact

- `app/actions/admin.ts`：新增 `purgeTestAccounts()` server action
- `components/AdminDashboard.tsx`（或等效的管理後台元件）：Tab I 新增按鈕與 confirm dialog
- `app/actions/admin.ts` 中現有的 `deleteMember()` 邏輯將被重用（清除 CharacterStats、DailyLogs、BonusApplications、CourseRegistrations、UserNineGrid、Rosters）
- 無資料庫 schema 變更、無新 migration
