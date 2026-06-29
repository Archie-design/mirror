## 1. 文案

- [ ] 1.1 `lib/constants.tsx`：將 p4 的 `sub` 由「子時（23:00）前入睡」改為「子時（23:00–01:00）入睡」（僅文字，不加時段限制）

## 2. UI 前置閘門

- [ ] 2.1 `components/Tabs/DailyQuestsTab.tsx`：在 p1Done 旁新增 `p4Done` / `p4DoneRecently`（重用既有 `prevLogicalDateStr` 跨午補償）
- [ ] 2.2 破曉打拳卡片 `disabled` 改為 `(!p1DoneRecently || !p4DoneRecently) && !dawnDone`
- [ ] 2.3 缺 p4 時卡片呈鎖定樣式（`opacity-40` + `cursor-not-allowed`）並顯示「需先完成子時入睡」原因提示
- [ ] 2.4 自動補記破曉的 useEffect（p1DawnPending）同步檢查 `p4DoneRecently`，避免送出註定失敗的請求

## 3. 後端 undo 連動

- [ ] 3.1 `app/actions/quest.ts`：將既有連動條件 `questId === 'p1'` 擴充為 `questId === 'p1' || questId === 'p4'`，重用刪除與 `rewardToDeduct` 累加邏輯

## 4. 前端回溯警語

- [ ] 4.1 `app/page.tsx`：回溯確認彈窗於 `undoTarget?.id === 'p4'` 且當日已有 p1_dawn 時顯示「將一併收回今日的破曉打拳」警語

## 5. 後端打卡防線

- [ ] 5.1 新增 `supabase/migrations/<date>_p1_dawn_require_p4.sql`，以 `202606030001` 為基底完整重建 `process_checkin`，在 p1_dawn 區塊 p1 檢查後插入 p4 檢查（回傳「需先完成子時入睡（p4）才能記錄破曉打拳加成。」）
- [ ] 5.2 於 Supabase 套用該 migration

## 6. 驗證

- [ ] 6.1 `npm run lint` 與 `npm run build` 通過
- [ ] 6.2 手動驗證：未完成 p4 時破曉鎖定；完成 p4 後解鎖並可記錄
- [ ] 6.3 手動驗證：收回 p4 連動收回 p1_dawn、分數扣回；收回 p1 既有連動不回歸
- [ ] 6.4 手動驗證：跨午邊界（前晚 p1+p4，隔日午前記錄破曉）仍成功
