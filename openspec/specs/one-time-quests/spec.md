# 一次性任務（one-time-quests）

## Purpose

定義 9 種一次性任務（o1, o2_1–o2_4, o3–o7）的目錄、獎勵、截止、申請次數、選填截圖佐證、以及一級／二級審核流程。一次性任務是學員在活動期間「真實行動」的記錄，需要審核以避免冒領。

> 來源：[docs/GAME_DESIGN.md §4.3](../../../docs/GAME_DESIGN.md)、[docs/ARCHITECTURE.md §4.5](../../../docs/ARCHITECTURE.md)、[docs/FEATURE_AUDIT_2026_05.md I-5、II-2、III-3](../../../docs/FEATURE_AUDIT_2026_05.md)

## Requirements

### Requirement: 任務目錄與獎勵

系統 SHALL 提供以下 9 種一次性任務 ID，獎勵與審核分級為：

| ID | 任務名稱 | 分數 | 審核級別 |
|----|---------|------|----------|
| o1 | 超越巔峰 | +1000 | 二級 |
| o2_1 | 戲劇進修－生命數字 | +300 | 一級 |
| o2_2 | 戲劇進修－生命蛻變 | +300 | 一級 |
| o2_3 | 戲劇進修－複訓大堂課 | +300 | 一級 |
| o2_4 | 戲劇進修－告別負債&貧窮 | +300 | 一級 |
| o3 | 聯誼會（1年） | +500 | 二級 |
| o4 | 聯誼會（2年） | +1000 | 二級 |
| o5 | 報高階（訂金） | +500/階 | 二級 |
| o6 | 報高階（完款） | +1000/階 | 二級 |
| o7 | 傳愛 | +1000/人 | 二級 |

學員端 UI MUST 顯示任務名稱、分數、審核分級標籤、說明。

#### Scenario: 學員看到任務目錄

- **WHEN** 學員進入「我的旅程 → 一次性任務」
- **THEN** 看到完整 9 個任務、各自分數標籤與「一級審核」/「二級審核」徽章

---

### Requirement: 申請截止日期

系統 SHALL 阻擋過了截止瞬間的新申請：

- `o7`：2026-07-12 00:00:00 +08:00 後不可申請
- 其餘 `o1, o2_*, o3–o6`：2026-07-02 00:00:00 +08:00 後不可申請

判斷以 server 時間（Asia/Taipei）為準。學員前端可顯示倒數，但**最終以 server 拒絕為主**。

#### Scenario: o7 在 7/11 仍可申請

- **WHEN** 學員於 2026-07-11 23:00 提交 o7 申請
- **THEN** 系統接受，寫入 status='pending'

#### Scenario: o7 在 7/12 後被拒

- **WHEN** 學員於 2026-07-12 00:01 提交 o7
- **THEN** 系統拒絕並回傳「一次性任務已截止（2026-07-11）」

#### Scenario: o5 在 7/2 後被拒

- **WHEN** 學員於 2026-07-02 00:01 提交 o5
- **THEN** 系統拒絕並回傳「一次性任務已截止（2026-07-01）」

---

### Requirement: 多次申請任務

`o5`、`o6`、`o7` 為「可多次申請」任務（每階訂金/完款各一次；傳愛無上限）。系統 SHALL 對這些 ID 不檢查既有 active 申請，每筆 `interview_target` 視為獨立的一次。

其餘任務（`o1, o2_*, o3, o4`）為「一筆即停」：學員若已存在 status ∈ {pending, squad_approved, approved} 的申請，**MUST NOT** 接受第二筆。

#### Scenario: 重複申請 o3 被擋

- **WHEN** 學員已有 o3 status='approved' 的紀錄
- **AND** 再次提交 o3
- **THEN** 系統拒絕並回傳「此任務已有申請記錄（已核准）」

#### Scenario: o7 多次申請

- **WHEN** 學員已有兩筆 o7 status='approved'
- **AND** 第三次提交 o7（介紹人 = 王小明）
- **THEN** 系統接受，寫入新一筆 status='pending'

---

### Requirement: 截圖佐證上傳（選填）

學員提交一次性任務 SHALL 可選擇附 1 張截圖佐證（聯誼會繳費收據、課程截圖、傳愛 LINE 對話等）。系統規範：

1. **格式**：JPEG / PNG / WebP（其他擋下）
2. **檔案大小**：上傳 API 限 5 MB；客戶端 SHALL 先壓縮（長邊 1280 px、JPEG 0.8）才送出
3. **儲存**：Supabase Storage bucket `bonus-screenshots`，路徑 `bonus/<userId>/<timestamp>.<ext>`
4. **欄位**：`BonusApplications.screenshot_url`（nullable，public URL）
5. **顯示**：小隊長 / 大隊長 / 管理員的審核 UI MUST 顯示截圖（若有），lazy-load、可點開原圖

不附截圖也可以送出（截圖是輔證，不是必填）。

#### Scenario: 學員附圖提交

- **WHEN** 學員選擇 8 MB 原圖、提交 o3
- **THEN** 客戶端壓縮成 ~400 KB JPEG → 上傳成功 → `screenshot_url` 寫入申請

#### Scenario: 學員不附圖提交

- **WHEN** 學員未選圖、提交 o3
- **THEN** 系統接受，`screenshot_url=null`，正常進入 pending 佇列

#### Scenario: 上傳 PDF 被拒

- **WHEN** 學員嘗試上傳 .pdf
- **THEN** 上傳 API 回傳 400「僅接受 JPEG / PNG / WebP 格式」、申請流程中止

#### Scenario: 審核者看到截圖

- **WHEN** 小隊長進入 o3 待審清單，該申請有 `screenshot_url`
- **THEN** UI 顯示縮圖；點縮圖在新分頁開原圖

---

### Requirement: 一級審核任務（戲劇進修 o2_*）

`o2_1`、`o2_2`、`o2_3`、`o2_4` 為一級審核任務。系統 SHALL：

1. 申請初始 status='pending'
2. 小隊長在「隊長基地」可看到本隊員的此類申請
3. 小隊長核准 → 直接 status='approved' + 該學員 +300
4. 小隊長退回 → status='rejected'、可附 notes
5. **無大隊長介入**

#### Scenario: 小隊長核准 o2_1

- **WHEN** 小隊長按核准
- **THEN** 申請 status='approved'，學員 Score +300

#### Scenario: 小隊長嘗試審外隊 o2_*

- **WHEN** 第1小隊小隊長嘗試審第2小隊員的 o2_3
- **THEN** 系統拒絕並回傳「僅能審本小隊申請」

---

### Requirement: 二級審核任務

`o1`、`o3`、`o4`、`o5`、`o6`、`o7` 為二級審核任務。系統 SHALL：

1. 申請初始 status='pending'
2. **第一級**：小隊長核准 → status='squad_approved'（**未入帳**）；退回 → status='rejected'
3. **第二級**：大隊長或管理員在「大隊長總部 → 二級審核」清單看到 squad_approved 申請
4. 大隊長/管理員核准 → status='approved' + 該學員獲得對應分數；退回 → status='rejected'
5. 任何時候只有 status='approved' 才入帳，且每筆申請至多入帳一次

#### Scenario: 二級審核完整流程

- **WHEN** 學員提交 o3 → 小隊長核准（變 squad_approved，0 分）→ 大隊長核准
- **THEN** 學員 Score +500，申請 status='approved'

#### Scenario: 一級退回

- **WHEN** 學員提交 o6、小隊長退回（notes='截圖不清'）
- **THEN** status='rejected'，學員可看到 notes，**無分數變動**

#### Scenario: 一級通過、二級退回

- **WHEN** o4 通過小隊長初審（squad_approved），大隊長以 notes='非有效續報' 退回
- **THEN** status='rejected'，**無分數變動**（即使 squad 已通過）

#### Scenario: 大隊長僅能終審本大隊

- **WHEN** 第一大隊大隊長嘗試終審第二大隊學員的 o3
- **THEN** 系統拒絕並回傳「僅能終審本大隊申請」（管理員不受此限）
