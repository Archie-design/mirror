# 人生大戲九宮格（nine-grid）

## Purpose

定義「人生大戲」九宮格親證系統的公版模板、學員九宮格初始化、格子完成（不計分）、連線計分（+300/條，上限 +2400）、小隊長覆核機制，以及與每週任務 wk4_* 的依賴關係。

> 來源：[docs/GAME_DESIGN.md §1.2、§1.3](../../../docs/GAME_DESIGN.md)、[docs/FEATURE_AUDIT_2026_05.md I-3、II-3、IV-4](../../../docs/FEATURE_AUDIT_2026_05.md)

## Requirements

### Requirement: 五運旅伴公版模板

系統 SHALL 維護五份公版九宮格模板，與五運旅伴一一對應：

| 旅伴 | 角色 | 對應五運 |
|------|------|---------|
| 小桃 | 體能運 | 健康、回到自己 |
| 小草 | 事業運 | 智慧、判斷力 |
| 小鐵 | 情感運 | 愛、流動 |
| 小獅 | 財富運 | 勇氣、值得感 |
| 翡翠城 | 家庭運 | 歸屬感 |

每份模板含 9 個格子（cells）+ 統一的 `cell_score`。模板 MUST 由管理員後台維護（[admin-console](../admin-console/spec.md)），學員端唯讀。

#### Scenario: 學員看不到模板編輯介面

- **WHEN** 一般學員開啟九宮格頁
- **THEN** 看到自己的格子（公版內容套用後）但無編輯按鈕

#### Scenario: 管理員編輯模板

- **WHEN** 管理員在「九宮格模板（Tab IV）」修改小草模板的某格描述
- **THEN** 既有 UserNineGrid 不變（已套用版本快照）、新註冊或重置者套用最新版

---

### Requirement: 學員九宮格初始化

學員 SHALL 透過以下兩種方式之一建立個人九宮格 `UserNineGrid`：

1. **註冊時自動初始化**：依 `registerAccount` 提供的五運分數，挑選最低的旅伴自動 `initMemberGrid(userId, companion)`
2. **個人主動選擇**：在「人生大戲」頁切換旅伴（會清空已完成記錄、重新套用模板）

每位學員同時 MUST 只有一份 active 的 UserNineGrid（同 userId 不可同時兩份）。

#### Scenario: 註冊時自動建立

- **WHEN** 學員註冊提供五運分數，最低為「情感運」
- **THEN** 系統建立 UserNineGrid（companion='情感運'），9 格從小鐵公版模板複製、`completed=false`

#### Scenario: 切換旅伴清空舊紀錄

- **WHEN** 學員從小鐵切到小草
- **THEN** 系統重建 UserNineGrid，9 格從小草公版重來，已完成的 cells 紀錄被清

---

### Requirement: 格子完成不計分

學員「完成一格」SHALL 在 `UserNineGrid.cells[i]` 標記 `completed=true` 並寫入 `DailyLogs`（QuestID = `nine_grid_cell|{index}`），但**該打卡本身分數為 0**。分數來自連線（見下一個 Requirement）。

#### Scenario: 完成一格

- **WHEN** 學員點完格 5
- **THEN** UserNineGrid.cells[5].completed=true，DailyLogs 寫入一筆 `nine_grid_cell|5`，學員 Score **不變**

#### Scenario: 重複完成同格 idempotent

- **WHEN** 學員嘗試重複完成格 5
- **THEN** 系統回傳「此格已完成」、不重複寫入 DailyLogs

---

### Requirement: 連線計分

當 9 格中達成 3 格連線（橫、直、對角共 8 條可能線）時，每條連線 SHALL 立即觸發 +300 分。

每條已成立的連線 MUST 寫入 `DailyLogs` 為 `nine_grid_line|cell{anchorIdx}`，並 idempotent（同條線只入帳一次，不論觸發順序如何）。

連線上限 = 8 條，最高累計 +2400。

#### Scenario: 第一條連線

- **WHEN** 學員完成格 0、1、2（第一橫線）
- **THEN** 學員 Score +300，DailyLogs 寫入 `nine_grid_line|cell0`

#### Scenario: 連線達上限

- **WHEN** 學員 9 格全完成（共 8 條連線：3 橫 + 3 直 + 2 對角）
- **THEN** 累計 +2400，後續再無連線可加

#### Scenario: 同條線多次觸發 idempotent

- **WHEN** 學員完成格 0、1、2 → 線 1 入帳 → 嘗試從格 1 視角再觸發線 1
- **THEN** 系統偵測既有 `nine_grid_line|cell0` 紀錄、不重複入帳

---

### Requirement: 小隊長覆核機制

小隊長 SHALL 可在「隊長基地 → 九宮格管理」對本隊員的格子點「取消完成」（`uncompleteCellByCapt`）。系統規則：

1. 限本小隊隊員（小隊長對非本隊員無效）
2. 取消後該格 `completed=false`、刪除對應 `DailyLogs.nine_grid_cell|{idx}`
3. 若該格曾觸發連線且尚未取消對應連線，系統 SHALL 自動回沖：
   - 找到所有已寫入但**現在條件不再成立**的 `nine_grid_line|*` 記錄
   - 每筆扣回 -300 分、刪除對應 DailyLog

#### Scenario: 小隊長取消一格、未影響連線

- **WHEN** 隊員完成 4 格但無連線、小隊長取消格 5
- **THEN** 該格 completed=false、Score 不變

#### Scenario: 取消觸發連線回沖

- **WHEN** 隊員完成格 0、1、2（線 1 已加 +300）、小隊長取消格 1
- **THEN** 格 1 重置 + 線 1 不再成立 → 系統自動扣 -300、刪 `nine_grid_line|cell0`

---

### Requirement: 與 wk4_* 的依賴

九宮格進度 MUST 阻擋 `wk4_small` 與 `wk4_large` 在「本週尚未完成任何格」時的打卡（詳見 [weekly-quests](../weekly-quests/spec.md)）。

#### Scenario: 0 格本週

- **WHEN** 學員本週尚未完成任何 nine_grid_cell
- **AND** 嘗試打 wk4_small
- **THEN** 系統拒絕「需本週至少完成 1 格」
