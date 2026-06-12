# Tasks — 計分歸期統一

> 時機：calculate-window 結束（2026-07-20 中午）後再部署 backfill 最安全。
> call-site 修正可較早合入，但效果僅及於之後的新核准。

## 1. 寫入端倒填 Timestamp（讓未來新核准就正確）

- [ ] 1.1 `weekly-practice.ts` `reviewWeeklyPracticeByAdmin`：`processCheckInCore(app.user_id, 'wk5|'+app.quest_date, '精進力', 2000, `${app.quest_date}T12:00:00+08:00`)`
- [ ] 1.2 `weekly-practice.ts` `reviewWeeklyPracticeByCommandant`：同上補第 5 參數
- [ ] 1.3 `temp-quest-application.ts` 核准入帳：`processCheckInCore(..., `${app.quest_date}T12:00:00+08:00`)`
- [ ] 1.4 確認 `processCheckInCore` 第 5 參數語義（傳入即用該 Timestamp 寫 DailyLogs，不再 now()）

## 2. 既有相容項驗證

- [ ] 2.1 `online-gathering.ts`：確認 wk3_online 入帳 Timestamp 已對齊任務週/日；若用 now() 則比照倒填
- [ ] 2.2 `squad-gathering.ts`：回歸驗證 wk3_offline 仍倒填 gathering_date（不應退化）
- [ ] 2.3 `nine_grid`：確認即時完成路徑 Timestamp ≈ 完成時刻；undo recalc（`nine_grid_line|recalc`）Timestamp 對排行無實質影響（連線分屬即時）

## 3. 歷史 backfill（一次性、冪等）

- [ ] 3.1 撰寫 `scripts/backfill-scoring-timestamp.ts`：找出 `wk5|%` / `temp_%|%` 中 `logicalDate(Timestamp) ≠ QuestID 日期` 者
- [ ] 3.2 dry-run 列出受影響筆數、每筆 (舊→新 Timestamp)、跨期影響（哪些會換週/月）
- [ ] 3.3 執行 UPDATE Timestamp = `${QuestID 日期}T12:00:00+08:00`（不動 RewardPoints/Score/QuestID）
- [ ] 3.4 驗證冪等（再跑 0 筆）

## 4. 快照回溯決策（待業務確認）

- [ ] 4.1 決定是否重算受影響的 WeeklyRankSnapshot / MonthlyRankSnapshot（預設：不動，只保證 live + 未來）
- [ ] 4.2 若要重算：以倒填後資料重跑對應週/月快照

## 5. 驗證

- [ ] 5.1 模擬：精進力任務日 W_n、核准於 W_{n+1} → 入帳後 `aggregate_dailylogs_by_user` 將其計入 W_n（非核准週）
- [ ] 5.2 抽查 backfill 後若干 wk5/temp 紀錄：Timestamp 邏輯日 == QuestID 日期
- [ ] 5.3 Score 不變（backfill 不改總分）：抽查數人 Score == ΣDailyLogs
- [ ] 5.4 `npx tsc --noEmit` 乾淨、`npm run build` 通過

## 6. 後續（可選，不在本 change 範圍）

- [ ] 6.1 將 `WeeklyTopicTab` / `NineGridTab` / dedup 的歸期判斷收斂為單一 helper `loggedScoringDate(log)`，退役 QuestID-date 補丁
