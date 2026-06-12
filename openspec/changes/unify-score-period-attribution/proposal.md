## Why

計分的「歸期」（一筆分數算在哪一週／哪一月）目前有兩套互相矛盾的策略混用：

- **策略 A — 倒填 Timestamp**：入帳時把 `DailyLogs.Timestamp` 設成「任務日中午」。`wk3_offline` / `wk3_online` 採此法 → 所有以 Timestamp 為界的消費端（排行 RPC、每週上限、快照）自動正確。
- **策略 B — Timestamp = 核准時間 + QuestID 埋日期**：`wk5`（精進力）、`temp_*`（臨時/秘密任務）入帳時 Timestamp = `now()`（核准當下），真正的任務日改埋在 QuestID（`wk5|YYYY-MM-DD`）。但**只有顯示層與去重檢查**被改成去讀 QuestID 日期，**排行/快照的唯一真相 `aggregate_dailylogs_by_user` 仍只看 Timestamp** → 跨週核准的精進力／臨時任務會被算進**核准週**而非**任務週**。

這個不一致是本季多次「歸錯期」bug 的根源（例：精進力上週任務、本週核准 → 排行算到本週；先前的 wk5 去重誤擋；admin_adjust 歸錯週）。每次都靠在「讀的一端」補丁，但**排行 RPC 永遠補不到**，且補丁越加越多。

## What Changes

確立**單一鐵律**：`DailyLogs.Timestamp` 一律等於「該筆分數的任務邏輯日中午（`YYYY-MM-DDT12:00:00+08:00`）」。寫入端負責讓這條成立，所有讀取端（本來就看 Timestamp）即自動正確。

- **核准入帳一律倒填 Timestamp**：`wk5`、`temp_*` 的核准改為呼叫 `processCheckInCore(..., backdatedTs)`（第 5 個 timestamp 參數，`wk3` 已在用），`backdatedTs = ${quest_date}T12:00:00+08:00`。
- **既有相容項確認**：`wk3_offline` / `wk3_online` 已倒填，僅需驗證；`nine_grid` 為即時完成（Timestamp ≈ 任務日，無核准延遲）→ 不在主範圍，僅確認 undo recalc 不破壞。
- **一次性歷史 backfill**：把已寫入、Timestamp 與 QuestID 內日期不一致的 `wk5|*` / `temp_*|*` 紀錄，倒填 Timestamp = QuestID 日期中午（冪等腳本）。**不改 Score、不改 RewardPoints**，僅校正歸期。
- **顯示層補丁退役（選用）**：`WeeklyTopicTab` / `NineGridTab` / `weekly-practice` 去重原本改讀 QuestID 日期的補丁，鐵律成立後可簡化回統一 helper；本次**保留**（當斷言／保險），列為後續可選清理。

不改：`aggregate_dailylogs_by_user` RPC、每週上限邏輯、Score 累加規則、各任務分數尺度。

## Capabilities

### Modified Capabilities

- `scoring-leaderboard`: 新增「計分歸期單一真相」requirement——所有 `DailyLogs.Timestamp` MUST = 任務邏輯日中午；review-gated 入帳 MUST 倒填。

## Impact

- **修改 Server Actions**：`app/actions/weekly-practice.ts`（`reviewWeeklyPracticeByAdmin` / `reviewWeeklyPracticeByCommandant` 的 `processCheckInCore` 補第 5 參數）、`app/actions/temp-quest-application.ts`（核准入帳補倒填 ts）
- **驗證（不一定改）**：`app/actions/online-gathering.ts`（wk3_online 倒填確認）、`app/actions/squad-gathering.ts`（wk3_offline 已倒填）
- **新增腳本**：`scripts/backfill-scoring-timestamp.ts`（一次性、冪等，倒填歷史 wk5/temp Timestamp）
- **不改 DB schema、不改 RPC**
- **時機**：屬計分寫入行為變更，**活動分數統計結束（2026-07-20 中午）後**再執行 backfill 與部署最安全；call-site 修正可先合入但效果僅及於之後的新核准
- **風險**：低（additive；wk3 已驗證此模式）。backfill 會改變「過去週/月榜」的歸期數字（使其正確）——需確認是否要回溯既有快照
