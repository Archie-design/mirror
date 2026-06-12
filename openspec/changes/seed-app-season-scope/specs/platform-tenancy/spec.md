## ADDED Requirements

### Requirement: 賽季範圍資料的多租戶 scope 鍵

所有「屬於某一賽季的帳本／申請／快照／產物」資料表 SHALL 帶 `app_id TEXT NOT NULL` 與 `season_id TEXT NOT NULL` 兩個 scope 欄位，用以在共用資料庫中區隔不同 app（如 `qinzheng`、`angel`）與不同賽季（如 `2026`、`2027`）。

- 範圍涵蓋（代表）：`DailyLogs`、`WeeklyRankSnapshot`、`MonthlyRankSnapshot`、`SquadGatheringSessions`/`Attendances`/`Checkins`、`OnlineGatheringApplications`、`WeeklyPracticeApplications`、`TempQuestApplications`、`TemporaryQuests`、`BonusApplications`、`UserNineGrid`、`TeamSettings`、`TopicHistory`、`Testimonies`、`FinePayments`、`CourseRegistrations`/`Attendance` 等賽季產物表。
- 不在範圍：純身分／全域設定表（`CharacterStats` 待後續 Account/Participation 拆分、`SystemSettings`、`Rosters`、`LineGroups`）。

scope 值 MUST 來自單一來源（`lib/scope.ts` 的 `CURRENT_APP_ID`/`CURRENT_SEASON_ID`，未來可由部署環境變數提供）；寫入新資料時 MUST 帶入該 scope。既有資料以欄位 DEFAULT 回填為當前部署的 scope（`qinzheng`/`2026`）。

本階段為**單租戶相容**：不要求讀取端一律加 scope 過濾、不啟用 scope-enforcing RLS、不改聚合 RPC。啟用多租戶讀取與隔離屬後續階段。

#### Scenario: 既有資料回填為當前賽季

- **WHEN** scope 欄位以 `NOT NULL DEFAULT 'qinzheng'/'2026'` 加到既有表
- **THEN** 所有既有 row 的 `app_id='qinzheng'`、`season_id='2026'`，且既有查詢結果與加欄位前完全一致

#### Scenario: 新寫入帶當前 scope

- **WHEN** 透過 `processCheckInCore` 或其他入帳路徑寫入一筆新紀錄
- **THEN** 該 row 的 `app_id`/`season_id` 等於 `lib/scope.ts` 的當前值

#### Scenario: forked 部署指向自己的 scope

- **WHEN** 明年親證班或小天使以 code fork 部署，調整 `lib/scope.ts`（或環境變數）
- **THEN** 其寫入的資料帶各自的 `app_id`/`season_id`，與既有賽季資料在同一庫中區隔，不互相覆蓋

#### Scenario: 單租戶行為不變

- **WHEN** 階段 0 完成、仍只有 `qinzheng/2026` 一個租戶
- **THEN** 打卡、凝聚、精進力、排行、後台明細等所有流程行為與改動前一致（讀取未加 scope filter 仍正確）
