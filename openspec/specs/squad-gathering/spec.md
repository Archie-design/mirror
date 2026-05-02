# 小組凝聚（squad-gathering）

## Purpose

定義「實體凝聚」與「線上凝聚」兩條獨立計分軌道的完整生命週期：場次建立、簽到（含 QR 與小隊長自助）、初審 / 終審、入帳。實體凝聚為 batch 入帳（300/人，至多 +200 加成）；線上凝聚為一級審核入帳（+100/人/週）。

> 來源：[docs/GAME_DESIGN.md §4.5、§4.6](../../../docs/GAME_DESIGN.md)、[docs/FEATURE_AUDIT_2026_05.md II-2、III-2](../../../docs/FEATURE_AUDIT_2026_05.md)

## Requirements

### Requirement: 實體凝聚場次建立

系統 SHALL 限制 `SquadGatheringSessions` 的建立者為「**該大隊的大隊長**」或「**管理員**」。其他角色（小隊長、一般學員）MUST 收到 `403 / 「僅限大隊長或管理員操作」`。

每筆場次需指定：`team_name`（小隊名稱）+ `gathering_date`（YYYY-MM-DD）+ 初始 `status='scheduled'`。

#### Scenario: 大隊長為本大隊小隊排期

- **WHEN** 第一大隊大隊長為「第一大隊-第1小隊」建立 2026-05-10 的凝聚
- **THEN** 系統建立 status='scheduled' 的 session，其他兩個大隊均無法見到此場次

#### Scenario: 大隊長嘗試為他大隊排期

- **WHEN** 第一大隊大隊長嘗試為「第二大隊-第1小隊」建立場次
- **THEN** 系統拒絕並回傳「僅能排定本大隊轄下小隊」

#### Scenario: 一般學員嘗試呼叫

- **WHEN** 任何非大隊長/非管理員的使用者呼叫 `scheduleSquadGathering`
- **THEN** 系統回傳 `{ success: false, error: '僅限大隊長或管理員操作' }`

---

### Requirement: QR 掃碼簽到範圍

掃碼簽到 SHALL 僅在以下條件全部成立時被接受：

1. session.status = `'scheduled'`
2. 系統當日（Asia/Taipei 邏輯日期）等於 session.gathering_date
3. 簽到者為「session 對應小隊的成員」**或**「該大隊的大隊長」
4. 同一 session × 同一 user 已簽到時 idempotent（回傳 `alreadyCheckedIn: true`，不重複寫入）

#### Scenario: 隊員當日掃碼成功

- **WHEN** 第一大隊-第1小隊隊員於 gathering_date 當日掃碼
- **THEN** 系統寫入 `SquadGatheringAttendances` 一筆，回傳 `success: true`

#### Scenario: 跨小隊隊員被拒

- **WHEN** 第一大隊-第2小隊隊員嘗試掃第1小隊的 QR
- **THEN** 系統拒絕並回傳「僅限本小隊成員或大隊長可掃此 QR」

#### Scenario: 大隊長簽到成功並標記

- **WHEN** 第一大隊大隊長掃第一大隊任一小隊的 QR
- **THEN** 系統接受，attendance 紀錄 `is_commandant=true`

#### Scenario: 隔日掃碼被拒

- **WHEN** 凝聚日為 2026-05-10、學員於 2026-05-11 掃碼
- **THEN** 系統拒絕並回傳「QR 僅限凝聚當日（2026-05-10）有效」

---

### Requirement: 小隊長自助簽到

小隊長因展示 QR 給隊員的需要，無法用同一支手機掃自己的 QR。系統 SHALL 在「隊長基地 → 本週實體凝聚」區塊提供「我也到場了（小隊長自己簽到）」按鈕，按下後直接呼叫 `scanGatheringQR(captainId, sessionId)` 寫入自己的 attendance。

#### Scenario: 小隊長按按鈕自助簽到

- **WHEN** 小隊長尚未簽到，點擊「我也到場了」
- **THEN** 系統寫入小隊長 attendance；按鈕跳成「我已完成報到」並 disabled

#### Scenario: 重複按按鈕

- **WHEN** 小隊長已簽到，按鈕為 disabled 狀態
- **THEN** 即使透過 DevTools 強行觸發，server 端 idempotent 不會建立重複紀錄

---

### Requirement: 小隊長送審條件與凍結

小隊長按「送出審核（交大隊長終審）」MUST 滿足：

1. session.status = `'scheduled'`
2. attendees 至少 1 筆

送審後系統 SHALL 將 session.status 改為 `'pending_review'`，**之後 QR 掃碼無效**（避免事後補簽）。

#### Scenario: 0 出席送審被擋

- **WHEN** 小隊長未有任何出席紀錄即按送審
- **THEN** 前端按鈕 disabled；server 端額外保護回 `{ success: false, error: '尚未有任何出席紀錄' }`

#### Scenario: 送審後嘗試掃碼

- **WHEN** session.status='pending_review'，新隊員嘗試掃碼
- **THEN** 系統拒絕並回傳「此凝聚已結束或被取消，無法再報到」

---

### Requirement: 大隊長終審與入帳規則

大隊長在「大隊長總部 → 待審實體凝聚」核准 SHALL 觸發批次入帳：

| 加成項 | 條件 | 額度 |
|--------|------|------|
| 基礎出席 | 該成員有 attendance 紀錄 | +300 |
| 全員到齊 | attendees 數 = 該小隊在冊成員數 | +100 |
| 大隊長到場 | 至少一位 attendance.is_commandant=true | +100 |

每位出席成員一次入帳，最高 500/人。session.status → `'approved'` 並寫入快照欄位（approvedAttendeeCount/approvedMemberCount/approvedHasCommandant/approvedRewardPerPerson）。

退回則 status → `'rejected'`、可附 notes、不入帳。

#### Scenario: 全員到齊 + 大隊長到場

- **WHEN** 第一大隊-第1小隊有 6 名在冊成員、6 人全部簽到、含大隊長
- **AND** 大隊長核准
- **THEN** 6 位成員各 +500，session.approvedRewardPerPerson=500

#### Scenario: 部分出席 + 無大隊長

- **WHEN** 6 名在冊、4 人簽到、無大隊長
- **AND** 大隊長核准
- **THEN** 4 位簽到者各 +300（無加成）

#### Scenario: 大隊長退回

- **WHEN** 大隊長按「退回」並填 notes='出席名單錯誤'
- **THEN** session.status='rejected'，無人入帳，notes 留存

---

### Requirement: 線上凝聚一級審核

學員提交「本週線上凝聚」申請後，**小隊長即可一審核准入帳 +100**，無需大隊長。系統 SHALL 滿足：

1. 「本週」以 Asia/Taipei 自動判定（學員端不可指定）
2. 同一學員、同一週只允許一筆 status ∈ {pending, approved} 的申請
3. 小隊長僅可審核本小隊成員的申請
4. 核准 → 該學員 +100；退回可附 notes、學員當週可重新提交

#### Scenario: 小隊長核准本隊申請

- **WHEN** 小隊長核准本隊員的待審凝聚
- **THEN** 該員 +100、申請 status='approved'

#### Scenario: 小隊長嘗試審別隊申請

- **WHEN** 第1小隊小隊長嘗試審第2小隊申請
- **THEN** 系統拒絕並回傳「僅能審本小隊」

#### Scenario: 同週重複提交

- **WHEN** 學員本週已有 status=pending 或 approved 的申請
- **AND** 再次提交
- **THEN** 系統拒絕並回傳「本週已有申請紀錄」

---

### Requirement: 線上凝聚審核冪等與防重入帳

同一學員、同一週的線上凝聚申請 MUST 至多入帳一次。即使小隊長重複按「核准」或多次提交，系統 SHALL 偵測並阻止重複入帳。

#### Scenario: 重複核准已核准申請

- **WHEN** 申請 status='approved'，小隊長再按一次核准
- **THEN** 系統不重複入帳、不改 score，回傳 `{ success: true, alreadyApproved: true }` 或同義訊息
