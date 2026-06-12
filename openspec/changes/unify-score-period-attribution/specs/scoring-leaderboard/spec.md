## ADDED Requirements

### Requirement: 計分歸期的單一真相（Timestamp = 任務邏輯日中午）

每筆 `DailyLogs` 的 `Timestamp` MUST 等於該筆分數所對應「任務邏輯日」的中午（`${questDate}T12:00:00+08:00`，Asia/Taipei）。週榜／月榜／快照（`aggregate_dailylogs_by_user`）與每週上限皆以 `Timestamp` 為界，因此「歸期」唯一取決於此值，寫入端 MUST 保證其正確。

- **即時任務**（d1–d8、p1–p5、diet_*、p1_dawn、nine_grid_*）：questDate = 完成當下的邏輯日（中午前算前一天），與寫入時刻自然一致。
- **需審核 / 補登任務**（wk5 精進力、temp_* 臨時/秘密任務、wk3_offline、wk3_online）：questDate = **任務日**，非核准日。入帳 MUST 以 `processCheckInCore` 的 timestamp 參數倒填為 `${questDate}T12:00:00+08:00`，不得使用核准當下的 `now()`。

中午 12:00+08 與邏輯日／賽季週／賽季月邊界一致，落在該邏輯日正中央，不卡邊界。

此 requirement 不改 `aggregate_dailylogs_by_user` 的定義、不改分數尺度、不改 Score 累加規則。

#### Scenario: 精進力跨週核准歸到任務週

- **WHEN** 學員的精進力任務日落在第 N 賽季週，於第 N+1 週才被核准入帳
- **THEN** 該筆 `wk5|<任務日>` 的 `Timestamp` 為 `<任務日>T12:00:00+08:00`，週榜將其計入**第 N 週**（非核准週 N+1）

#### Scenario: 臨時任務補登歸到完成日所在月

- **WHEN** 管理員核准一筆 `temp_<TS>|<完成日>` 申請
- **THEN** 入帳 `Timestamp` = `<完成日>T12:00:00+08:00`，月排行榜依「完成日所在賽季月」歸期

#### Scenario: 即時定課不受影響

- **WHEN** 學員打 d1 / p1 等即時任務
- **THEN** `Timestamp` 為當下時刻，其邏輯日即任務日，歸期不變

#### Scenario: 歷史倒填不改分數

- **WHEN** 對既有 Timestamp 與 QuestID 日期不一致的 `wk5|*` / `temp_*` 紀錄執行一次性倒填
- **THEN** 僅 `Timestamp` 變更為 QuestID 日期中午；`RewardPoints`、`CharacterStats.Score`、`QuestID` 不變，且重跑為冪等（0 筆）
