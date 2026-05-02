# 計分與排行榜（scoring-leaderboard）

## Purpose

定義計分尺度、累積規則、Streak 連續打卡計算，以及個人榜／小隊榜兩類排行榜的計算公式（含大隊長分數同步計入所有所屬小隊的特殊規則）。

> 來源：[docs/GAME_DESIGN.md §3、§5](../../../docs/GAME_DESIGN.md)、[docs/FEATURE_AUDIT_2026_05.md I-4](../../../docs/FEATURE_AUDIT_2026_05.md)

## Requirements

### Requirement: 計分尺度與類別

系統 SHALL 對每個任務 ID 維護固定的基礎分數，分組如下：

| 類別 | 來源 ID | 每項基礎分 |
|------|---------|----------|
| 基本定課 | d1–d8 | 20 |
| 加權定課 | p1–p5 | 50 |
| 飲控 | diet_veg / diet_seafood | 50 / 30 |
| 破曉加成 | p1_dawn | 50（與 p1 疊加） |
| 每週任務 | wk1, wk2, wk3_*, wk4_* | 見 [weekly-quests](../weekly-quests/spec.md) |
| 一次性任務 | o1–o7 | 見 [one-time-quests](../one-time-quests/spec.md) |
| 九宮格連線 | nine_grid_line\|* | 300/條 |
| 臨時加碼任務 | temp_<TS>\|<date> | 由管理員設定 |

任何分數調整 MUST 直接寫入 `CharacterStats.Score` 並寫一筆 `DailyLogs` 紀錄。

#### Scenario: 完成 d1 後 Score 增加

- **WHEN** 學員打 d1 成功
- **THEN** `CharacterStats.Score` += 20，`DailyLogs` 多一筆 `QuestID='d1', RewardPoints=20`

---

### Requirement: 五運分數同步

系統 SHALL 維護五個獨立的五運欄位：`Score_事業運`、`Score_財富運`、`Score_情感運`、`Score_家庭運`、`Score_體能運`。每筆任務分數 MUST 在主 `Score` 累加之外，**同步累加到所屬五運欄位**。

任務 → 五運的映射由 [lib/fortune.ts](../../../lib/fortune.ts) 提供（如 p1 → 體能運、d4 → 情感運）。

#### Scenario: 打 p1 同步加事業/體能

- **WHEN** 學員打 p1（打拳）+50
- **THEN** `Score` += 50、`Score_體能運` += 50（若 fortune mapping 為體能運）

---

### Requirement: Streak 連續打卡計算

`CharacterStats.Streak` SHALL 表示「至今的連續每日打卡天數」。系統規則：

1. 學員在「邏輯日期 X」打了任意一筆 DailyLogs → 該日視為已打卡
2. 連續日 = 邏輯日期序列中**沒有跳過任何一日**的最長後綴
3. 若一日完全沒有 DailyLogs，Streak 在隔日重置為 1（不為 0）

#### Scenario: 連 3 天打卡

- **WHEN** 學員連 3 個邏輯日各打 1 筆
- **THEN** Streak = 3

#### Scenario: 中斷後重新打

- **WHEN** 學員 Streak=5、跳過昨天、今日打卡
- **THEN** Streak = 1

---

### Requirement: 個人積分榜

「旅人榜」SHALL 顯示所有學員 + 大隊長 + 小隊長的個人累積分數，依 `Score` 由高到低排序。

每筆顯示：頭像、姓名、Score、Streak、SquadName、TeamName。

榜單可見者：所有登入者（含學員、小隊長、大隊長、管理員）。

#### Scenario: 個人榜排序

- **WHEN** 學員 A 5000 分、學員 B 3000 分、大隊長 C 7000 分
- **THEN** 旅人榜順序為 C → A → B

---

### Requirement: 小隊積分榜計算

「旅隊榜」的小隊平均分公式 SHALL 為：

```
小隊平均分 = (小隊成員分數總和 + 該大隊所有大隊長分數總和) ÷
            (小隊成員人數 + 該大隊大隊長人數)
```

關鍵性質：

- 大隊長**不歸屬**任何單一小隊（`TeamName=null`）
- 但其全額分數會**同步計入該大隊下每個小隊**的平均（不被稀釋）
- 雙大隊長的大隊（如第二、第九）：每個小隊都把兩位都加進去

#### Scenario: 一位大隊長的算法

- **WHEN** 第一大隊有 3 個小隊（A、B、C）每隊 6 人，大隊長 1 位 1000 分
- **AND** A 隊成員分數總和 = 600
- **THEN** A 隊平均 = (600 + 1000) / (6 + 1) = 228（取整數）

#### Scenario: 兩位大隊長的算法

- **WHEN** 第二大隊有兩位大隊長（共 1500 分）、A 小隊成員 6 人共 600 分
- **THEN** A 隊平均 = (600 + 1500) / (6 + 2) = 262

---

### Requirement: 大隊聚合計算

大隊層級的合計 SHALL 採相同精神：

```
大隊總分 = Σ(該大隊所有小隊成員分數) + Σ(該大隊大隊長分數)
大隊人數 = Σ(該大隊所有小隊成員人數) + 大隊長人數
大隊平均 = 大隊總分 / 大隊人數
```

#### Scenario: 一位大隊長 + 三小隊合併

- **WHEN** 大隊長 1000 + 三小隊各 6 人各 600
- **THEN** 大隊總分 = 1800 + 1000 = 2800、人數 = 18+1 = 19、平均 ≈ 147

---

### Requirement: 排行榜快照

系統 SHALL 在以下時間點寫入排行榜快照表：

- **每週快照**：週日 16:30 UTC（= 週一 00:30 Asia/Taipei） → `WeeklyRankSnapshot`
- **每月快照**：每月 1 日 16:30 UTC（= 該月 1 日 00:30 Asia/Taipei） → `MonthlyRankSnapshot`

快照寫入 MUST 由 [Vercel Cron + CRON_SECRET 認證](../../../app/api/cron/) 驅動，學員端不可手動觸發。

#### Scenario: 週快照

- **WHEN** 週一 00:30（Asia/Taipei）排程觸發
- **THEN** `WeeklyRankSnapshot` 多一筆「上週」結算的個人 + 小隊排名
