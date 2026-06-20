# 實體凝聚（Squad Gathering）已知待辦 Bug 清單

> 盤點日期：2026-06-20。來源：第12小隊 6/20「QR 故障→送審退回→QR 失效」案例觸發的全面審查。
> 主檔：[app/actions/squad-gathering.ts](../app/actions/squad-gathering.ts)。
>
> **已修復**（本清單不再追蹤）：
> - commit `59a86d5`：掃碼狀態死鎖（方向A：scheduled+pending_review 可掃、reject 退回 scheduled）、
>   gathering_date 比對地雷、M5 週上限上界、H1 cancelApprovedGathering、
>   H2 實得金額落 DailyLogs、H3 retryGatheringPayout。
> - 後續 commit：**M2**（挑選優先序：只有「今日」pending_review 優先，舊待審不再遮蔽未來場）、
>   **M6**（掃碼改用邏輯日，跨午夜到隔天中午前仍可掃；CaptainTab QR 閘門同步）、
>   **L1**（排定前若同日僅存 cancelled/rejected 作廢場則先刪除，可重排同一天）。
> - **M3**（跨隊掃碼權限改用 getCommandantTeamNames 權威判斷，不再從目標小隊抽樣
>   SquadName；移除多餘 select 欄位）。
>
> 以下為**尚未處理**的項目，依嚴重度排序。行號為 2026-06-20 當下。

---

## 高：H4 — 跨 session 併發核准可突破週上限

- **位置**：`payoutGatheringAttendees`（squad-gathering.ts ~L45-100）週上限以「先讀 existingLogs 再寫」實作，無 DB 層約束/鎖。
- **觸發**：同一人同一賽季週的兩場不同 session（例如 `reviewGathering` 與 `adminBackfillGathering`）**併發**核准 → 兩者各自讀到的週累積互不可見對方未提交的寫入 → 都判定有餘額 → 合計可超過每週 5000 上限。
- **後果**：少數情況下單人單週 wk3_offline 超發。實務上需「同人同週兩場幾乎同時核准」才會踩到，機率低。
- **修法方向**：DB 層對 wk3_offline 加週累積約束（trigger / 限額檢查），或把週上限檢查移進 `process_checkin` RPC 內以單一 transaction 鎖定。屬較大工程。
- **嚴重度**：高（金額正確性），但觸發條件苛刻。

---

## 低：L2 — 送審只擋 0 人，未擋「未達最低人數」

- **位置**：squad-gathering.ts L771-772，`submitGatheringForReview` 只要 ≥1 人就放行；最低人數（一般 3 / 體系長 5）延到 `reviewGathering` 核准時才檢查。
- **後果**：隊長可送一個注定被打回的審，到大隊長端才發現。體驗問題。
- **修法方向**：送審時就用 `minAttendeesFor` 檢查並提示。
- **嚴重度**：低（體驗）。

## 低：L3 — 全到判定用「即時隊員數」，補報歷史場會失真

- **位置**：`computeGatheringReward` 的 memberCount（L36）來自核准/補報當下查 `CharacterStats` 的隊員數（L~840 / L1199 區）。
- **觸發**：凝聚後有隊員退隊/加入 → 補報或延後核准時 memberCount 是當前值，非凝聚當日值 → 全到 +1000 判定可能與當時事實不符。
- **修法方向**：若需精準，於排定/掃碼時快照當日隊員數存進 session。
- **嚴重度**：低（資料準確性）。

## 低：L4 — getGatheringStatus 的 isComplete 用 client 傳入的 allMemberCount

- **位置**：squad-gathering.ts L147-173，`isComplete = checkins.length >= allMemberCount`，`allMemberCount` 由 client 傳入（不可信來源）。
- **註**：屬舊 sq1-sq4 流程（`SquadGatheringCheckins`），與新系統（`SquadGatheringAttendances`）獨立，影響面小。
- **修法方向**：若仍在用，改由 server 端查隊員數；若已棄用，考慮移除。
- **嚴重度**：低。

## 低：L5 — 體系長掃一般小隊場時 is_commandant=true（待確認語意）

- **位置**：squad-gathering.ts L647，`is_commandant: isCommandant || isSystemHead`。
- **行為**：體系長（IsSystemHead）掃一般小隊場時 attendance 記 `is_commandant=true`。則 `computeGatheringReward` 的 memberAttendeeCount（`filter(!is_commandant)`）會排除體系長（正確），且 hasCommandant=true 觸發 +1000（語意上體系長≥大隊長，合理）。
- **註**：目前行為基本一致，列此供確認是否符合規則設計（體系長到一般小隊場是否該觸發大隊長加成）。
- **嚴重度**：低（待確認，非必為 bug）。

---

## 處理建議順序（剩餘項目）

1. **H4**：金額正確性，但觸發苛刻；需 DB 層改動，獨立排程。
2. **L2-L5**：低風險，可併入日常維護或忽略（L4/L5 先確認是否仍適用）。
