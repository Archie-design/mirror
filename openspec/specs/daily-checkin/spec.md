# 每日打卡（daily-checkin）

## Purpose

定義學員每日定課的範圍、上限、計分與重複申報的處理。打卡是整個系統的「核心生理節律」：每天固定時間、可預期分數、可累計連續日（Streak）。

> 來源：[docs/GAME_DESIGN.md §4.1](../../../docs/GAME_DESIGN.md)、[docs/ARCHITECTURE.md §4.1](../../../docs/ARCHITECTURE.md)、[docs/FEATURE_AUDIT_2026_05.md I-1](../../../docs/FEATURE_AUDIT_2026_05.md)

## Requirements

### Requirement: 邏輯日期判定（Logical Date）

每日打卡以「邏輯日期」為單位計算上限與重複偵測。系統 SHALL 採用 Asia/Taipei 時區、且 **00:00–11:59 之間** 的打卡記錄計入「前一日」邏輯日期，**12:00 之後** 才計入「當日」邏輯日期。

#### Scenario: 凌晨打卡計入前一日

- **WHEN** 學員於 Asia/Taipei 時間 02:30 打卡 d1
- **THEN** 該筆打卡的邏輯日期為前一日（前一個自然日）

#### Scenario: 中午後打卡計入當日

- **WHEN** 學員於 14:00 打卡 d1
- **THEN** 該筆打卡的邏輯日期為當日（同一個自然日）

---

### Requirement: 基本定課 d1–d8 每日上限

系統 SHALL 提供 8 種基本定課（d1–d8），每項固定 **20 分**。每位學員在同一邏輯日期內最多累計 **3 項** 基本定課（不論是哪 3 項），超過的打卡 MUST 被拒絕並回傳錯誤訊息。

#### Scenario: 一日內三項基本定課

- **WHEN** 學員在邏輯日期 2026-05-02 已打卡 d1、d2、d3
- **AND** 嘗試打卡 d4
- **THEN** 系統拒絕該打卡並回傳「今日基本定課已達上限」

#### Scenario: 累計分數計算

- **WHEN** 學員當日打卡 d1、d2、d3 各一次
- **THEN** 學員 `Score` 增加 60 分（3 × 20）

---

### Requirement: 加權定課 p1–p5 每日上限

系統 SHALL 提供 5 種加權定課（p1–p5），每項固定 **50 分**，與基本定課獨立計算上限。每位學員在同一邏輯日期內最多累計 **3 項** 加權定課。

#### Scenario: 加權定課與基本定課獨立計算

- **WHEN** 學員當日已打卡 d1、d2、d3（基本定課滿 3 項）
- **AND** 打卡 p1
- **THEN** 系統接受 p1 打卡，學員 `Score` 增加 50 分

#### Scenario: 加權定課自身上限

- **WHEN** 學員當日已打卡 p1、p2、p3
- **AND** 嘗試打卡 p4
- **THEN** 系統拒絕並回傳「今日加權定課已達上限」

---

### Requirement: 破曉打拳 p1_dawn 加成

`p1_dawn` 是 p1 的特殊加成，固定 **+50 分**，與 p1 同日合計 +100。系統 SHALL 滿足以下所有條件才接受 p1_dawn：

1. 打卡時間（系統時間）在 **05:00–11:59 Asia/Taipei** 之間
2. 同一邏輯日期已存在 p1 打卡記錄（或上一邏輯日期跨午前的 p1，以涵蓋邊界）

`p1_dawn` MUST NOT 佔用加權定課的 3 項上限，且每邏輯日最多 **1 次**。

#### Scenario: 午前完成 p1 後加打 p1_dawn

- **WHEN** 學員 06:30 完成 p1 打卡
- **AND** 立即接著打 p1_dawn
- **THEN** 系統接受 p1_dawn，當日累計 +100（p1 50 + p1_dawn 50）

#### Scenario: 午後嘗試 p1_dawn 被拒

- **WHEN** 學員 13:00 嘗試打 p1_dawn
- **THEN** 系統拒絕並回傳「破曉打拳僅限 12:00 前可記錄」

#### Scenario: 沒先打 p1 直接打 p1_dawn

- **WHEN** 學員當日尚未打 p1，直接呼叫 p1_dawn
- **THEN** 系統拒絕並回傳「需先完成 p1（打拳）才能記錄破曉加成」

---

### Requirement: 飲控 diet_veg / diet_seafood 互斥單日

系統 SHALL 提供兩種飲控任務 ID：`diet_veg`（三餐吃素，+50）、`diet_seafood`（三餐海鮮素，+30）。每邏輯日 **僅可擇一打卡**，兩者互斥。

#### Scenario: 同日打 diet_veg 後嘗試 diet_seafood

- **WHEN** 學員當日已打卡 diet_veg
- **AND** 嘗試打卡 diet_seafood
- **THEN** 系統拒絕並回傳「今日已記錄飲控，無法再記錄另一項」

#### Scenario: 飲控不佔基本/加權定課額度

- **WHEN** 學員當日已打 d1、d2、d3 + p1、p2、p3
- **AND** 打 diet_veg
- **THEN** 系統接受，當日 +50（飲控獨立於 d/p 上限）

---

### Requirement: 同任務同日 idempotent

對於同一邏輯日期、同一 QuestID 的重複打卡呼叫，系統 SHALL 拒絕後續呼叫並回傳明確錯誤，**MUST NOT** 重複入帳，**MUST NOT** 寫入第二筆 `DailyLogs`。

#### Scenario: 重複呼叫同一任務

- **WHEN** 學員邏輯日期 2026-05-02 已成功打 d1
- **AND** 再次呼叫打 d1（網路重試或誤點）
- **THEN** 系統回傳「今日已記錄此任務」，分數與紀錄不變

#### Scenario: 跨邏輯日期可重新打

- **WHEN** 學員邏輯日期 2026-05-01 已打 d1
- **AND** 邏輯日期 2026-05-02（隔日 12:00 後）打 d1
- **THEN** 系統接受，視為新日新紀錄
