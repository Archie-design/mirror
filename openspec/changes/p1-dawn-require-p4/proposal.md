## Why

破曉打拳（`p1_dawn`）是「清晨打拳」的作息加成，而能清晨早起打拳的前提是前一晚早睡。目前 `p1_dawn` 只要求當日已完成 p1（打拳），與「子時入睡」的作息引導脫節。為強化早睡早起的閉環，破曉打拳應額外要求學員先完成「子時入睡（p4）」。

## What Changes

- 破曉打拳（`p1_dawn`）新增前置條件：除了現有的「已完成 p1」外，**還必須已完成 p4（子時入睡）**，p4 採與 p1 相同的「今日或前一邏輯日」判定範圍。
- 收回（undo）p4 時，若當日已記錄 p1_dawn，**系統連動收回該筆 p1_dawn 並扣回分數**（沿用既有「收回 p1 連動收回 p1_dawn」的行為），前端回溯彈窗明確警示。
- UI：破曉打拳卡片在缺少 p4 時呈鎖定態並顯示「需先完成子時入睡」原因提示。
- 文案：p4「子時入睡」說明由「子時（23:00）前入睡」更新為「子時（23:00–01:00）入睡」。**不新增任何打卡時段強制**，p4 維持整天可打卡。

## Capabilities

### New Capabilities
<!-- 無新增 capability。本變更修改既有 daily-checkin 的需求。 -->

### Modified Capabilities
- `daily-checkin`: 破曉打拳 `p1_dawn` 的接受條件新增「需先完成 p4」；新增「收回 p4 連動收回 p1_dawn」的行為需求；p4 文案調整。

## Impact

- 程式碼：
  - `lib/constants.tsx`（p4 文案）
  - `components/Tabs/DailyQuestsTab.tsx`（破曉打拳卡片 p4 前置閘門與鎖定提示）
  - `app/actions/quest.ts`（undo 連動由 p1 擴充至 p1 與 p4）
  - `app/page.tsx`（回溯確認彈窗連動警語）
  - `supabase/migrations/`（新 migration 重建 `process_checkin`，p1_dawn 區塊加 p4 前置防線）
- 不影響其他 quest 或排行榜計分邏輯；無破壞性 API 變更。
- 後端 migration 須於 Supabase 套用後 p4 前置防線方生效。
