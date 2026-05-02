## ADDED Requirements

### Requirement: 角色驅動的匯出範圍

匯出端點 SHALL 依呼叫者角色限制資料範圍：

- **管理員**（`verifyAdminSession()` 通過）：可匯出全營成員與所有小隊摘要。
- **大隊長**（`CharacterStats.IsCommandant = true`）：僅能匯出 `SquadName` 等於自己 `SquadName` 的成員與該大隊內的小隊摘要。
- **任何其他角色**：MUST 回傳 `{ success: false, error: '無權限' }`，且 NOT 進行任何資料庫讀取。

#### Scenario: 管理員匯出全營

- **WHEN** 管理員後台點「下載成員清單」
- **THEN** 系統回傳含全部成員（如 200 筆）與全部 27 個小隊摘要的 CSV

#### Scenario: 大隊長匯出本大隊

- **WHEN** 大隊長 A（`SquadName='第一大隊'`）點「下載成員清單」
- **THEN** 系統回傳僅含「第一大隊」成員與該大隊 3 個小隊摘要的 CSV
- **AND** 不含其他大隊任何資料

#### Scenario: 一般學員嘗試呼叫

- **WHEN** 一般學員（非管理員、非大隊長）以任何方式呼叫匯出端點
- **THEN** 系統回傳 `{ success: false, error: '無權限' }`，HTTP 不暴露其他大隊資料

### Requirement: CSV 雙區塊結構

匯出 CSV SHALL 由兩段組成，以**單一空行**分隔：

1. **成員區**：表頭為 `UserID,姓名,手機末三碼,大隊,小隊,角色,累積總分,Streak,最後簽到日`，每行一個成員。
2. **小隊摘要區**：表頭為 `小隊名稱,隊長姓名,隊員數,平均分,總分,凝聚已核准次數`，每行一個小隊。

整個 CSV MUST 以 UTF-8 BOM (`﻿`) 開頭以支援 Excel。

#### Scenario: CSV 結構驗證

- **WHEN** 匯出回傳 CSV 字串
- **THEN** 第一個字元為 BOM `﻿`
- **AND** CSV 可被 Python `csv.reader` 解析
- **AND** 「成員區」與「小隊摘要區」之間恰好有一行空白

#### Scenario: Excel 中文不亂碼

- **WHEN** 用 Excel for Mac 或 Excel 365 直接開啟下載的 CSV
- **THEN** 中文姓名、大隊名、角色標籤皆正確顯示，無亂碼

### Requirement: 成員區欄位內容

成員區每筆成員的欄位 SHALL 來自下列來源：

- **UserID**：`CharacterStats.UserID`（標準化後 9 位手機）
- **姓名**：`CharacterStats.Name`
- **手機末三碼**：`UserID` 取末 3 字元
- **大隊**：`CharacterStats.SquadName`，缺值時填空字串
- **小隊**：`CharacterStats.TeamName`，大隊長因 `TeamName=null` 填「（大隊長）」
- **角色**：依 `IsCommandant`/`IsCaptain` 旗標映射到 `大隊長`/`小隊長`/`一般`（IsCommandant 優先）
- **累積總分**：`CharacterStats.Score`
- **Streak**：`CharacterStats.Streak`
- **最後簽到日**：`CharacterStats.LastCheckIn`，缺值時填空字串

#### Scenario: 大隊長角色與小隊欄位

- **WHEN** 匯出包含一位 `IsCommandant=true, TeamName=null` 的大隊長
- **THEN** 該行「角色」欄為「大隊長」
- **AND** 「小隊」欄為「（大隊長）」

#### Scenario: 含 CSV 特殊字元的姓名

- **WHEN** 某成員姓名含逗號或雙引號（如 `王, "小明"`）
- **THEN** 系統用標準 CSV 規則跳脫（雙引號加倍、整個欄位包雙引號）
- **AND** Excel 開啟時姓名仍完整顯示為 `王, "小明"`

### Requirement: 小隊摘要區欄位內容

小隊摘要每行 SHALL 對應一個 `TeamName`，欄位定義：

- **小隊名稱**：`TeamName`
- **隊長姓名**：該小隊內 `IsCaptain=true` 成員的 `Name`，多人時以「、」串接
- **隊員數**：該小隊內成員總數（含小隊長）
- **平均分**：該小隊所有成員 `Score` 的算術平均，**取整數**（floor），無成員時填 0
- **總分**：該小隊所有成員 `Score` 加總
- **凝聚已核准次數**：該小隊在 `SquadGatheringSessions` 中 `status='approved'` 的記錄數

依大隊內小隊名稱字典序排序輸出。

#### Scenario: 小隊摘要計算

- **WHEN** 第一大隊-第1小隊有 6 名成員，分數 [100, 200, 150, 50, 300, 0]
- **THEN** 「總分」=800、「平均分」=133（800/6 floor）、「隊員數」=6

#### Scenario: 已核准凝聚計數

- **WHEN** 某小隊在過去 4 週有 3 筆已核准凝聚、1 筆已駁回
- **THEN** 「凝聚已核准次數」=3

### Requirement: 下載 UI 入口

系統 SHALL 在以下位置提供「下載成員清單」按鈕：

- **管理員後台**：[components/Admin/AdminDashboard.tsx](components/Admin/AdminDashboard.tsx) 「I.i 學員名冊管理」區塊內，與「批量匯入名冊」並列。
- **大隊長總部**：[components/Tabs/CommandantTab.tsx](components/Tabs/CommandantTab.tsx) 首屏（進入頁時即可見），不需要捲動。

按鈕 MUST 在點擊後呼叫對應 server action、收到 CSV 字串後觸發瀏覽器下載，檔名為 `members_export_<YYYY-MM-DD>.csv`。

#### Scenario: 管理員下載

- **WHEN** 管理員點按鈕
- **THEN** 瀏覽器下載 `members_export_2026-05-02.csv`
- **AND** 按鈕在處理期間顯示「匯出中…」並 disabled

#### Scenario: 大隊長下載

- **WHEN** 大隊長點按鈕
- **THEN** 下載的 CSV 僅含本大隊資料，檔名仍為 `members_export_<日期>.csv`
- **AND** 按鈕未出現在小隊長/一般學員的 UI

### Requirement: 效能上限

匯出端點 SHALL 在以下資料規模下於 P95 < 1 秒內回應：

- 成員數 ≤ 250
- 小隊數 ≤ 30
- 過去 6 個月凝聚記錄 ≤ 200

實作 MUST 用單一查詢或最多 3 個 round trip，**不可** N+1。

#### Scenario: 200 名成員匯出

- **WHEN** 全營有 200 名成員、27 小隊、約 80 筆已核准凝聚
- **THEN** server action 從接收呼叫到回傳 CSV 字串 < 1 秒
- **AND** Vercel function 日誌中沒有 N+1 SELECT 警告
