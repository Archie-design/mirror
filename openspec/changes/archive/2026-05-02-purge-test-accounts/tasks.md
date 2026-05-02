## 1. Server Action

- [x] 1.1 在 `app/actions/admin.ts` 新增 `listTestAccounts()`：查詢 `CharacterStats WHERE "UserID" !~ '^[0-9]{9}$'`，回傳 `{ userId, name }[]`，需先 `verifyAdminSession()`
- [x] 1.2 在 `app/actions/admin.ts` 新增 `purgeTestAccounts()`：呼叫 `listTestAccounts()` 取清單，對每筆執行完整刪除邏輯（CharacterStats、DailyLogs、BonusApplications、CourseRegistrations、UserNineGrid、Rosters），`count > 0` 時寫批次 AdminLogs（action='purge_test_accounts'，details 含 deletedIds + count），回傳 `{ count: number }`

## 2. 管理後台 UI

- [x] 2.1 在管理後台 Tab I「成員管理」底部新增「清除測試帳號」紅色按鈕（`variant="destructive"` 或等效樣式）
- [x] 2.2 點擊按鈕時先呼叫 `listTestAccounts()` 取得清單，若 count=0 顯示「目前無測試帳號」toast 並結束
- [x] 2.3 若 count>0，顯示 confirm dialog：列出所有待刪帳號（UserID + Name）、標明「此操作不可撤銷」、提供「取消」與「確認刪除 (N 筆)」按鈕
- [x] 2.4 確認後呼叫 `purgeTestAccounts()`，完成後顯示成功 toast「已清除 N 筆測試帳號」並刷新成員列表

## 3. 驗收

- [x] 3.1 確認 `listTestAccounts()` 返回 `test_u01`–`test_u20` 及 `roster_NN_123` 系列帳號，不返回 9 位數字 UserID
- [x] 3.2 執行 `purgeTestAccounts()` 後，`CharacterStats`、`DailyLogs`、`Rosters` 等 6 張表中相關記錄已清除
- [x] 3.3 `AdminLogs` 中有一筆 action='purge_test_accounts'，details.deletedIds 包含所有被刪 UserID
- [x] 3.4 9 位數字學員帳號完全不受影響
