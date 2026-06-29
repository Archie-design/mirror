## Context

破曉打拳 `p1_dawn` 目前僅以「已完成 p1」作為前置。閘門分布在三處且彼此呼應：UI（`DailyQuestsTab.tsx`）、後端 undo（`quest.ts`）、後端打卡 RPC（`process_checkin`）。三者皆以 `getLogicalDateStr()`（午前算前一天）作為「邏輯日」判定基準，p1 的跨午邊界已採「今日或前一邏輯日」的雙日比對。本變更要在同樣三處加入對 p4（子時入睡）的對等處理。

關鍵既有資產：`quest.ts` 的 undo 流程中（撤銷 p1 時連動刪除同邏輯日 p1_dawn）已存在現成連動模式，新需求可直接擴充而非新寫。

## Goals / Non-Goals

**Goals:**
- p1_dawn 需同時滿足 p1 與 p4（皆採今日/前一邏輯日判定）方可記錄，UI 與後端 RPC 雙層一致。
- 收回 p4 時連動收回當日 p1_dawn 並扣回分數，前端事先警示。
- p4 文案更新為「子時（23:00–01:00）入睡」。

**Non-Goals:**
- 不對 p4 加任何打卡時段強制（維持整天可打卡）。
- 不改 p1_dawn 既有計分、每日上限、跨午邏輯本身。
- 不重寫 daily-checkin spec 中與本變更無關的部分。

## Decisions

1. **p4 判定範圍沿用 p1**：UI 以 `prevLogicalDateStr` 重用既有跨午補償；RPC 以同一 `CASE ... ARRAY[p_logical_today, p_logical_today-1]` 比對 `QuestID='p4'`。理由：子時入睡實際發生在前一晚，與 p1 跨午語意一致，且重用既有程式降低風險。

2. **undo 連動採擴充而非新增**：把 `quest.ts` 既有 `if (questId === 'p1')` 連動區塊改為 `questId === 'p1' || questId === 'p4'`，刪除與 `rewardToDeduct` 累加邏輯完全沿用。理由：行為與既有「收回前置 → 連動收回加成」一致，改動最小。

3. **後端以新 migration 重建 `process_checkin`**：遵循專案慣例（每次改 RPC 新增日期命名 migration，不改舊檔），以 `202606030001` 為基底，僅在 p1_dawn 區塊 p1 檢查之後插入 p4 檢查。

4. **UI 鎖定態而非隱藏**：缺 p4 時破曉卡片仍顯示（前提 p1 已完成），但 disabled + 鎖定樣式 + 原因提示，讓使用者知道「還差子時入睡」。

## Risks / Trade-offs

- **連續提交自動補記（useEffect）**：勾「同記破曉」並打 p1 後會自動補送 p1_dawn；若 p4 未完成，後端會擋下並回錯誤。緩解：自動補記前同步檢查 `p4DoneRecently`，避免送出註定失敗的請求。
- **後端生效時點**：p4 前置防線需 migration 套用後才生效；UI 閘門先行不影響安全（後端仍有 p1 檢查），但完整一致性以套用 migration 為準。
- **既有 spec 漂移**：`openspec/specs/daily-checkin` 對 p1_dawn 的舊敘述（+50、12:00 限制）已與程式不符；本 delta 在 MODIFIED 內順手校正為 +500、無時段限制，避免延續錯誤。
