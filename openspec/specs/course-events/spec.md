# 課程場次與簽到（course-events）

## Purpose

定義「親證曆」課程報名（學員端）+ QR 簽到（志工端）+ 雙週罰款結算的完整流程，含冪等保證、UNIQUE 約束、志工密碼授權機制。

> 來源：[docs/ARCHITECTURE.md §4.6](../../../docs/ARCHITECTURE.md)、[docs/FEATURE_AUDIT_2026_05.md I-6、IV-6](../../../docs/FEATURE_AUDIT_2026_05.md)、[CLAUDE.md](../../../CLAUDE.md)

## Requirements

### Requirement: 課程場次目錄

`SystemSettings.CourseEvents` SHALL 以 JSON 陣列形式儲存所有課程場次，每筆 `CourseEvent` 含：

| 欄位 | 用途 |
|------|------|
| `id` | localStorage key 與 `CourseRegistrations.course_key` |
| `name` | 課程名稱 |
| `date` / `dateDisplay` | 機器格式 + 顯示格式 |
| `time` | 時段，例「19:00–21:40」 |
| `location` | 場地 |
| `enabled` | false 時報名按鈕 disabled |

管理員 SHALL 可在「Tab VI 課程場次」新增 / 編輯 / 啟停場次。

#### Scenario: 停用的場次無法報名

- **WHEN** 管理員把場次 X 的 `enabled=false`
- **THEN** 學員端「親證曆」中該卡片按鈕 disabled、即使 client 強行呼叫，server 也應拒絕

---

### Requirement: 學員報名

學員 SHALL 透過 `registerForCourse(name, phone3, courseKey)` 報名：

1. 用 name + 手機末三碼比對 `CharacterStats`（同 [loginWithPhone](../auth-and-roster/spec.md)）
2. 命中 → UPSERT `CourseRegistrations` (UNIQUE: `user_id+course_key`)
3. 回傳 `registrationId`
4. 前端把 `registrationId` 存 localStorage（key 為 `course_<courseKey>_reg`）並產 QR Code

#### Scenario: 重複報名 idempotent

- **WHEN** 學員已報名某課、再次提交相同表單
- **THEN** UPSERT 命中、回傳同一個 registrationId、無新增 row

#### Scenario: 姓名 + 末三碼錯誤

- **WHEN** 學員輸入錯誤的姓名或末三碼
- **THEN** server 回傳「查無此觀影者帳號」，前端不存 QR

---

### Requirement: 志工掃碼簽到

志工 SHALL 透過以下流程簽到學員到場：

1. 進「親證曆」→「志工入口」
2. 輸入 `SystemSettings.VolunteerPassword`
3. 開啟 Scanner（dynamic import、`ssr: false`）
4. 掃學員 QR → 解碼出 `registrationId` → 呼叫 `markAttendance(registrationId, note?)`
5. server UPSERT `CourseAttendance`（UNIQUE: `user_id+course_key`）

#### Scenario: 重複掃碼 idempotent

- **WHEN** 志工掃同一張 QR 兩次
- **THEN** 第二次 UPSERT 命中、回傳 `alreadyCheckedIn: true`、不建第二筆

#### Scenario: 志工密碼錯誤

- **WHEN** 志工輸入錯誤密碼
- **THEN** 前端顯示錯誤、不開啟 Scanner

---

### Requirement: 志工密碼授權

`SystemSettings.VolunteerPassword` SHALL 由管理員後台「Tab V 系統設定 → 志工掃碼授權」設定。密碼以明文存於 `SystemSettings`（容忍此風險，因密碼僅授權「進入掃碼介面」、不授權其他敏感操作）。

#### Scenario: 管理員修改密碼

- **WHEN** 管理員把 VolunteerPassword 從 'old' 改為 'new'
- **THEN** 之後輸入 'old' 不再生效

---

### Requirement: 雙週罰款結算

系統 SHALL 提供小隊長端的罰款結算功能（`checkSquadFineCompliance(captainUserId, mondayISO?)`），用於計算本小隊成員過去兩週每日打卡缺失天數 × 罰金。

冪等性 MUST 透過 `AdminActivityLog` 中相同 `(period_label, team_name)` 記錄做 short-circuit：同一週期、同小隊不重複加罰。

罰金額度由 [PENALTY_PER_DAY](../../../lib/constants.tsx) 定義（目前 50 元/天）。

#### Scenario: 同週期重跑被擋

- **WHEN** 小隊長今天已跑「第 17 週」結算
- **AND** 同日再按一次
- **THEN** server 偵測 AdminActivityLog 已有紀錄、不重複加罰

#### Scenario: 跨週期可重跑

- **WHEN** 小隊長為「第 17 週」結算後、第 19 週按下一輪結算
- **THEN** 系統建立新一筆 AdminActivityLog、跑新區間

---

### Requirement: 罰款記錄與繳交

小隊長 SHALL 可記錄：

- **個別繳交**（`recordFinePayment(captainId, targetId, amount, period)`）：標記某成員某週期已繳，更新 `CharacterStats.FinePaid`、寫 `FinePayments`
- **小隊上繳**（`recordOrgSubmission(captainId, amount, date)`）：記錄整隊上繳組織的總額，寫 `SquadFineSubmissions`

#### Scenario: 個別繳交記錄

- **WHEN** 小隊長按「成員 X 繳交 100 元」
- **THEN** CharacterStats X.FinePaid += 100、FinePayments 新增一筆

#### Scenario: 小隊上繳記錄

- **WHEN** 小隊長記錄「上繳 600 元」
- **THEN** SquadFineSubmissions 新增一筆，含 team_name + amount + date
