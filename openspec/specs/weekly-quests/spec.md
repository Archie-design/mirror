# 每週任務（weekly-quests）

## Purpose

定義學員每週可完成的 4 類任務（破框練習、天使通話、小組凝聚、人生大戲分享）的範圍、上限、審核要件、以及自動阻擋未滿足條件的打卡。

> 來源：[docs/GAME_DESIGN.md §4.2](../../../docs/GAME_DESIGN.md)、[docs/FEATURE_AUDIT_2026_05.md I-2](../../../docs/FEATURE_AUDIT_2026_05.md)
> 相關 capability：`squad-gathering`（wk3_*）、`nine-grid`（wk4_*）

## Requirements

### Requirement: 任務目錄與每週上限

系統 SHALL 提供以下每週任務 ID，每週重新計算上限（週的定義以 Asia/Taipei 時區、週一 00:00 為界）：

| ID | 任務 | 分數 | 每週上限 | 審核 |
|----|------|-----|---------|------|
| wk1 | 破框練習 | +200/次 | 3 次（600 分） | 無 |
| wk2 | 天使通話 | +200/次 | 2 次（400 分） | 無 |
| wk3_online | 小組凝聚（線上） | +100/人 | 1 次/週 | 一級 |
| wk3_offline | 小組凝聚（實體） | 300–500（公式見 squad-gathering） | 1 次/週 | 二級 |
| wk4_small | 人生大戲（小群分享） | +200 | 1 次/週 | 無 |
| wk4_large | 人生大戲（大群分享） | +300 | 1 次/週 | 無 |

#### Scenario: wk1 達上限後再打被拒

- **WHEN** 學員本週已打 wk1 三次
- **AND** 嘗試第四次 wk1
- **THEN** 系統拒絕並回傳「本週此任務已達上限」

#### Scenario: 跨週重置

- **WHEN** 學員上週已達 wk1 上限
- **AND** 本週一 00:01 嘗試 wk1
- **THEN** 系統接受，視為本週第一筆

---

### Requirement: 週區間定義

「本週」SHALL 以 server 時區（Asia/Taipei）自動判定：以週一 00:00 為起、下週一 00:00 為止。學員端不可指定 / 偽造週區間，所有上限檢查 MUST 以 server 計算為準。

#### Scenario: 週日深夜打卡

- **WHEN** 學員於週日 23:59 打 wk1
- **THEN** 該筆計入「本週」

#### Scenario: 週一凌晨打卡

- **WHEN** 學員於週一 00:01 打 wk1
- **THEN** 該筆計入「新一週」（前一週的次數歸零）

---

### Requirement: wk4 自動依賴九宮格進度

`wk4_small` 與 `wk4_large` 為「人生大戲分享」任務。系統 SHALL 滿足以下兩條件才接受打卡：

1. 學員在「本週區間內」**至少完成 1 格九宮格**（任何一格都算）
2. 學員當週尚未為同一 ID（wk4_small 或 wk4_large）成功入帳

不滿足條件 MUST 在前端 UI 阻擋按鈕並在 server 端拒絕。

#### Scenario: 本週 0 格 → wk4_small 被拒

- **WHEN** 學員本週尚未完成任何九宮格
- **AND** 嘗試打 wk4_small
- **THEN** 系統拒絕並回傳「需本週至少完成 1 格九宮格才能分享」

#### Scenario: 本週 ≥1 格 → wk4_small 接受

- **WHEN** 學員本週完成 1 格九宮格、尚未打 wk4_small
- **AND** 提交 wk4_small
- **THEN** 系統接受，+200，當週本任務不可再打

---

### Requirement: wk3_online 連動

`wk3_online` 由 `squad-gathering` capability 實作（線上凝聚一級審核）。系統 SHALL：

1. 學員提交申請時建立 wk3_online 記錄為 status='pending'，**不入帳**
2. 小隊長核准後才入帳 +100、status='approved'
3. 同一學員本週至多入帳一次

#### Scenario: 線上凝聚核准入帳

- **WHEN** 小隊長核准本週本隊員的線上凝聚申請
- **THEN** 該員 +100，wk3_online 狀態為已入帳，當週不可再提交

---

### Requirement: wk3_offline 連動

`wk3_offline` 由 `squad-gathering` capability 實作（實體凝聚二級審核）。系統 SHALL 在大隊長終審核准後，依 squad-gathering 的計分公式批次入帳給每位 attendees，**不在 wk3_offline 個人額度上加 cap**（每週由 session 決定，不以個人為單位）。

#### Scenario: 同週兩場實體凝聚

- **WHEN** 同小隊本週意外排了兩場實體凝聚（管理員操作異常）、皆有 attendees
- **AND** 兩場都被大隊長核准
- **THEN** 系統依 session 為單位入帳兩次（這是設計決定：以 session 為單位而非個人 wk3_offline 上限），並透過 admin UI 流程預防同週重排
