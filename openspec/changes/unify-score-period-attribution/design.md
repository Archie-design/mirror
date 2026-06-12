# Design — 計分歸期統一（Timestamp = 任務邏輯日中午）

## 問題本質

「一筆分數算在哪一週/哪一月」需要一個明確的時間。系統目前有兩個候選真相，且**被混用**：

| 候選 | 含義 | 問題 |
|------|------|------|
| `DailyLogs.Timestamp` | 寫入/核准的時刻 | review-gated 任務晚核准 → 漂到核准週 |
| QuestID 內埋的日期（`wk5\|date`、`temp_x\|date`）| 任務實際完成日 | 只有部分讀取端會去 parse |

排行榜/快照的唯一真相是 RPC：

```sql
aggregate_dailylogs_by_user(p_start, p_end):
  SUM(RewardPoints) WHERE Timestamp >= p_start AND Timestamp < p_end
```

它**只看 Timestamp**。因此只要某類分數的 Timestamp ≠ 任務日，就會歸錯期，而且**無法靠改顯示層修正**。

## 現況分類（trace 結果）

```
即時完成（Timestamp = 任務時刻，本就正確）
  d1–d8 / p1–p5 / diet_* / p1_dawn ............. quest.ts check-in（邏輯日 = Timestamp）
  nine_grid_cell / nine_grid_line .............. 即時完成，completed_at ≈ Timestamp

策略 A — 倒填 Timestamp（已正確）
  wk3_offline .................................. reviewGathering: gatheringTs = `${gathering_date}T12:00+08`
  wk3_online .................................. （待驗證是否倒填到 week_monday/任務日）

策略 B — Timestamp=核准時間 + QuestID 埋日期（會漂，需修）
  wk5（精進力）................................ reviewWeeklyPracticeBy{Admin,Commandant}
                                                processCheckInCore(uid,'wk5|date','精進力',2000)  ← 無第5參數
  temp_*（臨時/秘密任務）...................... temp-quest-application 核准
                                                processCheckInCore(uid,'<qid>|date',...)         ← 無第5參數
  讀取端補丁（已存在，治標）：
    WeeklyTopicTab/NineGridTab countThisWeek → 讀 QuestID datePart
    weekly-practice 去重 → 讀 QuestID 範圍（本季剛修）
  讀取端漏網（治不到）：
    aggregate_dailylogs_by_user → 只看 Timestamp  ← 歸錯期的真正出口
```

## 決策：Option 1（倒填寫入端），不選 Option 2（改 RPC）

| | Option 1 倒填 Timestamp | Option 2 RPC 改讀 QuestID |
|---|---|---|
| 規則 | Timestamp = 任務邏輯日中午（單一真相）| RPC 解析 QuestID 日期、d/p 仍用 Timestamp |
| 改動 | 幾個核准 call site 補第5參數 + 1 支 backfill | 改 PL/pgSQL（字串解析 + 分支）+ 各消費端 |
| 連帶 | 排行/上限/快照/顯示全部自動一致 | 只修排行；其餘補丁續存 |
| 風險 | 低（wk3 已驗證此模式，additive）| 高（動 RPC、改歷史數字、難測、難讀）|

**選 Option 1。** 本質是「把事實來源（寫入端）一致化」，而非「讓每個讀取端各自正確」。

## 鐵律（canonical rule）

> 每一筆 `DailyLogs` 的 `Timestamp` MUST 等於該筆分數所對應「任務邏輯日」的中午：`${questDate}T12:00:00+08:00`。
> - 即時任務：questDate = 完成當下的邏輯日（現狀已成立）。
> - review-gated / 補登任務：questDate = 任務日（**非核准日**）；入帳時以 `processCheckInCore` 第 5 個 timestamp 參數倒填。

選中午 12:00+08 的理由：與邏輯日邊界（中午切日）、賽季週/月界（皆以 `T12:00:00+08:00` 為界）完全對齊，落在該邏輯日的正中央，不會卡邊界。

## 受影響 call sites（實作清單見 tasks.md）

1. `weekly-practice.ts` → 2 處核准（admin、commandant）補 `${app.quest_date}T12:00:00+08:00`
2. `temp-quest-application.ts` → 核准入帳補 `${app.quest_date}T12:00:00+08:00`
3. `online-gathering.ts` → 確認 wk3_online 入帳 Timestamp = 任務週/日（不一致則比照倒填）
4. `squad-gathering.ts` → wk3_offline 已倒填，僅回歸驗證

## 歷史 backfill

```
對象：DailyLogs WHERE QuestID LIKE 'wk5|%' OR QuestID LIKE 'temp\_%|%'
     AND getLogicalDateStr(Timestamp) <> (QuestID 內的日期)
動作：UPDATE Timestamp = `${QuestID 日期}T12:00:00+08:00`
不動：RewardPoints、Score、QuestID
性質：冪等（再跑無效果，因已一致）
```

### 待確認的回溯範圍
- **既有週/月快照（WeeklyRankSnapshot / MonthlyRankSnapshot）** 是否一併重算？backfill 後 live aggregate 會自動正確，但已寫死的歷史快照不會自動更新。選項：(a) 不動歷史快照（只保證 live + 未來）；(b) 重跑受影響週/月的快照。建議 (a)，除非有人會調閱舊快照對帳。

## 顯示層補丁的去留

鐵律成立後，`WeeklyTopicTab` / `NineGridTab` 讀 QuestID 日期的 countThisWeek 與 Timestamp 版會得到相同結果。**本次保留**（當作斷言/保險，且避免擴大 diff）；未來可選擇收斂成單一 helper `loggedScoringDate(log)`，列為後續清理（不在本 change）。

## 不在本 change

- `aggregate_dailylogs_by_user` RPC 不動。
- Score 一致性（Score = ΣDailyLogs 的 DB 強制）為另一條獨立議題（trigger/view），與此分開。
- nine_grid completed_at 模型不改（無核准延遲）。
