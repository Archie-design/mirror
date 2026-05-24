# 資料庫欄位規格書 (Schema Reference)

> **對應 migration**:至 `202605240001`
> **Source of truth**:`supabase/migrations/000000000001_complete_schema.sql` + 後續 ALTER
> **撈資料前請先讀**:本文最後的「⚠️ 撈資料常見坑」

---

## 目錄

- [速查索引](#速查索引)
- [全表清單](#全表清單分區整理)
- 各表詳細
  - **用戶與系統**:[CharacterStats](#1-characterstats--角色主表-)、[Rosters](#2-rosters--學員名冊)、[SystemSettings](#3-systemsettings--全域設定)、[AdminActivityLog](#4-adminactivitylog--管理員操作日誌)、[LineGroups](#5-linegroups--line-群組記錄)
  - **任務與打卡**:[DailyLogs](#6-dailylogs--每日打卡記錄-)、[temporaryquests](#7-temporaryquests--臨時任務定義)、[BonusApplications](#8-bonusapplications--一次性任務申請-o1o9)、[TempQuestApplications](#9-tempquestapplications--臨時任務申請-temp_)
  - **小隊與凝聚**:[TeamSettings](#10-teamsettings--小隊設定)、[MandatoryQuestHistory](#11-mandatoryquesthistory--抽籤歷史)、[SquadGatheringCheckins](#12-squadgatheringcheckins--舊版-qr-掃碼報到)、[SquadGatheringSessions](#13-squadgatheringsessions--wk3_offline-主檔)、[SquadGatheringAttendances](#14-squadgatheringattendances--wk3_offline-出席表)、[OnlineGatheringApplications](#15-onlinegatheringapplications--wk3_online-申請)
  - **九宮格**:[NineGridTemplates](#16-ninegridtemplates--五大公版模板)、[UserNineGrid](#17-userninegrid--學員個人九宮格)
  - **排行榜**:[WeeklyRankSnapshot](#18-weeklyranksnapshot--週榜歷史)、[MonthlyRankSnapshot](#19-monthlyranksnapshot--月榜歷史)
  - **課程**:[CourseRegistrations](#20-courseregistrations--親證曆報名)、[CourseAttendance](#21-courseattendance--親證曆報到)
  - **罰款**:[FinePayments](#22-finepayments--個人罰款記錄)、[SquadFineSubmissions](#23-squadfinesubmissions--小隊向組織繳款)
  - **其他**:[TopicHistory](#24-topichistory--主題歷史)、[Testimonies](#25-testimonies--line-見證回報)
- [QuestID 對照](#questid-對照dailylogsquestid)
- [RPC 函式速覽](#rpc-函式速覽)
- [常見撈取場景](#常見撈取場景)
- [⚠️ 撈資料常見坑](#️-撈資料常見坑)

---

## 速查索引

| 想找什麼 | 看哪張表 |
|---------|---------|
| 學員基本資料、總分、身份 | [CharacterStats](#1-characterstats--角色主表-) |
| 每筆打卡記錄(所有任務最終都會寫一筆) | [DailyLogs](#6-dailylogs--每日打卡記錄-) |
| 5 大運命分數 | CharacterStats(`Score_事業運` 等 5 欄) |
| 名冊匯入用清單 | [Rosters](#2-rosters--學員名冊) |
| 全域設定(公告、停用任務等) | [SystemSettings](#3-systemsettings--全域設定) |
| 後台操作稽核日誌 | [AdminActivityLog](#4-adminactivitylog--管理員操作日誌) |
| 小隊設定(team_coins、每週抽籤) | [TeamSettings](#10-teamsettings--小隊設定) |
| 臨時任務定義 | [temporaryquests](#7-temporaryquests--臨時任務定義) |
| 一次性任務申請(o1-o9) | [BonusApplications](#8-bonusapplications--一次性任務申請-o1o9) |
| 臨時任務申請(temp_*) | [TempQuestApplications](#9-tempquestapplications--臨時任務申請-temp_) |
| 線上小組凝聚申請 | [OnlineGatheringApplications](#15-onlinegatheringapplications--wk3_online-申請) |
| 實體小組凝聚場次 | [SquadGatheringSessions](#13-squadgatheringsessions--wk3_offline-主檔) |
| 實體小組凝聚出席 | [SquadGatheringAttendances](#14-squadgatheringattendances--wk3_offline-出席表) |
| 學員九宮格進度 | [UserNineGrid](#17-userninegrid--學員個人九宮格) |
| 週榜/月榜歷史 | [WeeklyRankSnapshot](#18-weeklyranksnapshot--週榜歷史) / [MonthlyRankSnapshot](#19-monthlyranksnapshot--月榜歷史) |
| 親證曆(課程)報名 | [CourseRegistrations](#20-courseregistrations--親證曆報名) |
| 親證曆報到 | [CourseAttendance](#21-courseattendance--親證曆報到) |
| 個人罰款明細 | [FinePayments](#22-finepayments--個人罰款記錄) |
| 小隊繳款到組織 | [SquadFineSubmissions](#23-squadfinesubmissions--小隊向組織繳款) |

---

## 全表清單(分區整理)

| 分區 | 表名 | 用途一句話 |
|------|------|-----------|
| A. 用戶與系統 | `CharacterStats` | 角色主表,每位學員一筆 |
| | `Rosters` | 名冊匯入用(管理員預先建表) |
| | `SystemSettings` | 全域 key-value 設定 |
| | `AdminActivityLog` | 管理員操作稽核 |
| | `LineGroups` | LINE 群組記錄 |
| B. 任務與打卡 | `DailyLogs` | 所有打卡記錄 |
| | `temporaryquests` | 臨時任務定義(後台動態建立) |
| | `BonusApplications` | 一次性任務申請(o1-o9) |
| | `TempQuestApplications` | 臨時任務申請(temp_*) |
| C. 小隊與凝聚 | `TeamSettings` | 小隊設定 |
| | `MandatoryQuestHistory` | 每週抽籤歷史 |
| | `SquadGatheringCheckins` | 舊版 QR 掃碼報到 |
| | `SquadGatheringSessions` | wk3_offline 場次主檔 |
| | `SquadGatheringAttendances` | wk3_offline 出席明細 |
| | `OnlineGatheringApplications` | wk3_online 申請 |
| D. 九宮格 | `NineGridTemplates` | 五大公版模板 |
| | `UserNineGrid` | 學員個人九宮格 |
| E. 排行榜快照 | `WeeklyRankSnapshot` | 週榜歷史 |
| | `MonthlyRankSnapshot` | 月榜歷史 |
| F. 課程 | `CourseRegistrations` | 親證曆報名 |
| | `CourseAttendance` | 親證曆報到 |
| G. 罰款 | `FinePayments` | 個人罰款明細 |
| | `SquadFineSubmissions` | 小隊→組織繳款 |
| H. 其他 | `TopicHistory` | 主題歷史 |
| | `Testimonies` | LINE 見證回報 |

> **欄位命名約定**:PascalCase 引號(`"UserID"`)的是老表(早期沿用);snake_case 不需引號的是新表。SQL 用 PostgreSQL 客戶端時 PascalCase 欄位**一定要 double-quote**,否則會被視為小寫。

---

## 1. CharacterStats — 角色主表 ⭐

**用途**:每位學員一筆,存基本資料、累積分數、5 大運命分數、角色身份。

**PK**:`"UserID"` (TEXT) — 通常是 9 位數手機末 9 碼(如 `912345678`)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"UserID"` | TEXT | — | **主鍵**。手機末 9 碼 |
| `"Name"` | TEXT | NOT NULL | 學員姓名 |
| `"Role"` | TEXT | `'default'` | ⚠️ 早期遺跡欄位,目前不使用 |
| `"Score"` | INTEGER | 0 | **累積總分**(原 `Exp` 欄位,5/22 改名) |
| `"Streak"` | INTEGER | 0 | 連續打卡天數 |
| `"LastCheckIn"` | TEXT | NULL | 最近一次打卡邏輯日期 `YYYY-MM-DD` |
| `"Birthday"` | TEXT | NULL | `YYYY-MM-DD` |
| `"Email"` | TEXT | NULL | 已非主要識別,僅供參考 |
| `"SquadName"` | TEXT | NULL | 大隊名稱 |
| `"TeamName"` | TEXT | NULL | 小隊名稱 |
| `"IsCaptain"` | BOOLEAN | false | 小隊長 |
| `"IsCommandant"` | BOOLEAN | false | 大隊長 |
| `"IsGM"` | BOOLEAN | false | 遊戲管理員 |
| `"IsAdmin"` | BOOLEAN | false | 大法師密室登入權限 |
| `"SquadRole"` | TEXT | NULL | 小隊職稱(副隊長/抱抱/衡衡/叮叮1號/叮叮2號/樂樂) |
| `"LineUserId"` | TEXT | NULL | LINE Login 綁定 ID |
| `"Score_事業運"` | SMALLINT | 0 NOT NULL | 自評運命分數(0–100) |
| `"Score_財富運"` | SMALLINT | 0 NOT NULL | 同上 |
| `"Score_情感運"` | SMALLINT | 0 NOT NULL | 同上 |
| `"Score_家庭運"` | SMALLINT | 0 NOT NULL | 同上 |
| `"Score_體能運"` | SMALLINT | 0 NOT NULL | 同上 |
| `"created_at"` | TIMESTAMPTZ | now() | 註冊時間 |

> **歷史欄位**(已 DROP,撈資料時不會看到):`Coins`、`Spirit`、`Physique`、`Charisma`、`Savvy`、`Luck`、`Potential`、`Facing`、`HP`、`MaxHP`、`GameGold`、`GameInventory`、`DDA_Difficulty`。皆早期遊戲設計遺留,202604170001 已移除。

**TS interface**:`CharacterStats` ([types/index.ts:1](../types/index.ts#L1))

**常見查詢**

```sql
-- 拿所有 admin / 大隊長 / 小隊長
SELECT "UserID", "Name", "SquadName", "TeamName", "SquadRole",
       "IsAdmin", "IsCommandant", "IsCaptain"
FROM "CharacterStats"
WHERE "IsAdmin" OR "IsCommandant" OR "IsCaptain"
ORDER BY "SquadName", "TeamName";

-- 某大隊全員按分數排序
SELECT "Name", "TeamName", "Score"
FROM "CharacterStats"
WHERE "SquadName" = '光明大隊'
ORDER BY "Score" DESC;
```

---

## 2. Rosters — 學員名冊

**用途**:管理員預先匯入的合法學員清單。註冊時驗證手機末 9 碼是否在此表內。

**PK**:`phone` (TEXT) — 9 位手機末碼(202605020001 之前用 email,已淘汰)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `phone` | TEXT | — | **主鍵**。9 位手機末碼 |
| `name` | TEXT | NULL | 姓名 |
| `birthday` | TEXT | NULL | YYYY-MM-DD |
| `squad_name` | TEXT | NULL | 大隊 |
| `team_name` | TEXT | NULL | 小隊 |
| `is_captain` | BOOLEAN | false | 小隊長 |
| `is_commandant` | BOOLEAN | false | 大隊長 |
| `created_at` | TIMESTAMPTZ | now() | — |

**索引**:`idx_rosters_phone` ON `phone`

**TS interface**:`Roster` ([types/index.ts:24](../types/index.ts#L24)) — 注意 TS 還有 `email` 欄位是舊版命名,實際表已無此欄

---

## 3. SystemSettings — 全域設定

**用途**:key-value 全域設定。所有設定都用 upsert 方式寫入。

**PK**:`"SettingName"` (TEXT)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"SettingName"` | TEXT | — | **主鍵** |
| `"Value"` | TEXT | NULL | 設定值,可為純字串或 JSON 字串 |

### 已知設定鍵

| SettingName | Value 內容 |
|-------------|-----------|
| `RegistrationMode` | `'open'` 或 `'roster'` |
| `VolunteerPassword` | 志工掃碼密碼 |
| `QuestRewardOverrides` | JSON:`{questId: reward}` 動態調整定課分數 |
| `DisabledQuests` | JSON 陣列:停用的定課 ID |
| `CourseEvents` | JSON 陣列:慶典場次設定 |
| `Announcements` | JSON 陣列:公告(newest first) |
| `Announcement` | (舊版單一公告,向下相容) |

**TS interface**:`SystemSettings` ([types/index.ts:102](../types/index.ts#L102))

---

## 4. AdminActivityLog — 管理員操作日誌

**用途**:後台操作稽核,所有管理員動作都會寫一筆。

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"action"` | TEXT | NOT NULL | 動作代碼(e.g. `delete_member`, `manual_score_adjust`) |
| `"actor"` | TEXT | NULL | 操作者 UserID 或姓名 |
| `"target_id"` | TEXT | NULL | 目標 UserID |
| `"target_name"` | TEXT | NULL | 目標姓名 |
| `"details"` | JSONB | NULL | 動作細節(欄位視動作不同) |
| `"result"` | TEXT | `'success'` | `success` / `failure` |
| `"created_at"` | TIMESTAMPTZ | now() | — |

**索引**:`idx_adminlog_created_at` ON `"created_at" DESC`

**TS interface**:`AdminLog` ([types/index.ts:133](../types/index.ts#L133))

---

## 5. LineGroups — LINE 群組記錄

**用途**:LINE Bot 收到訊息時記錄群組 ID,給見證系統用。

**PK**:`"group_id"` (TEXT)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"group_id"` | TEXT | — | **主鍵**。LINE 群組 ID |
| `"group_name"` | TEXT | NULL | 群組名稱(用 LINE API 解析) |
| `"created_at"` | TIMESTAMPTZ | now() | — |

---

## 6. DailyLogs — 每日打卡記錄 ⭐

**用途**:**所有任務最終都會在此寫一筆**。學員的「歷史軌跡」就在這張表。

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"UserID"` | TEXT | NOT NULL | FK → `"CharacterStats"."UserID"` (ON DELETE CASCADE, ON UPDATE CASCADE) |
| `"QuestID"` | TEXT | NOT NULL | 任務 ID(見 [QuestID 對照](#questid-對照dailylogsquestid)) |
| `"QuestTitle"` | TEXT | NULL | 任務顯示名稱(冗餘存,方便撈資料) |
| `"Timestamp"` | TIMESTAMPTZ | now() | 打卡時間(伺服器 UTC,顯示時轉 Asia/Taipei) |
| `"RewardPoints"` | INTEGER | 0 | 本次入帳分數 |

**索引**:
- `idx_dailylogs_userid` ON `"UserID"`
- `idx_dailylogs_timestamp` ON `"Timestamp"`
- `idx_dailylogs_questid` ON `"QuestID"`

**TS interface**:`DailyLog` ([types/index.ts:40](../types/index.ts#L40))

**常見查詢**

```sql
-- 某學員某天的打卡(邏輯日 5/24 = 5/24 12:00 ~ 5/25 12:00 台灣時間)
SELECT "QuestID", "QuestTitle", "RewardPoints", "Timestamp"
FROM "DailyLogs"
WHERE "UserID" = '912345678'
  AND "Timestamp" >= '2026-05-24 12:00:00+08'
  AND "Timestamp" <  '2026-05-25 12:00:00+08'
ORDER BY "Timestamp";

-- 全班今天的活躍度
SELECT COUNT(DISTINCT "UserID") AS active_users
FROM "DailyLogs"
WHERE "Timestamp" >= '2026-05-24 12:00:00+08'
  AND "Timestamp" <  '2026-05-25 12:00:00+08';

-- 某學員某 QuestID 的所有歷史
SELECT "Timestamp", "RewardPoints"
FROM "DailyLogs"
WHERE "UserID" = '912345678' AND "QuestID" = 'p1'
ORDER BY "Timestamp";
```

---

## 7. temporaryquests — 臨時任務定義

**用途**:後台動態建立的臨時任務(QuestID 為 `temp_<timestamp>`)。

**PK**:`id` (TEXT) — 形如 `temp_1716537600`

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `id` | TEXT | — | **主鍵**。`temp_<unix_seconds>` |
| `title` | TEXT | NOT NULL | 任務名稱 |
| `sub` | TEXT | NULL | 短說明 |
| `"desc"` | TEXT | NULL | 完成標準 |
| `reward` | INTEGER | 0 NOT NULL | 分數 |
| `limit_count` | INTEGER | 1 NOT NULL | 每日/週上限 |
| `active` | BOOLEAN | true NOT NULL | 是否啟用 |
| `created_at` | TIMESTAMPTZ | now() NOT NULL | — |

> **注意**:表名是**小寫** `temporaryquests`,不是 PascalCase。SQL 寫 `from "temporaryquests"` 就好(不需要 quote 但加了也不會錯)。

**TS interface**:`TemporaryQuest` ([types/index.ts:59](../types/index.ts#L59))

---

## 8. BonusApplications — 一次性任務申請 (o1-o9)

**用途**:一次性任務(o1=超越巔峰、o2_*=戲劇進修、o3-o4=聯誼會、o5-o6=報高階、o7=傳愛、o8=圓夢計畫、o9=心成活動)。二級審核流程。

**狀態流**:`pending → squad_approved → approved`(或 `rejected`)

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"user_id"` | TEXT | NOT NULL | 學員 UserID |
| `"user_name"` | TEXT | NOT NULL | 學員姓名 |
| `"squad_name"` | TEXT | NULL | 大隊 |
| `"battalion_name"` | TEXT | NULL | 大隊(語意同 squad_name,部分舊代碼用此名) |
| `"interview_target"` | TEXT | NULL | 申請項目描述(課程名/被介紹人/活動說明...) |
| `"interview_date"` | TEXT | NULL | 申請日期 YYYY-MM-DD |
| `"description"` | TEXT | NULL | 補充說明 |
| `"quest_id"` | TEXT | NOT NULL | `o1` / `o2_1` / ... / `o9` |
| `"status"` | TEXT | `'pending'` | `pending` / `squad_approved` / `approved` / `rejected` |
| `"squad_review_by"` | TEXT | NULL | 初審者 |
| `"squad_review_at"` | TIMESTAMPTZ | NULL | 初審時間 |
| `"squad_review_notes"` | TEXT | NULL | 初審備註 |
| `"final_review_by"` | TEXT | NULL | 終審者 |
| `"final_review_at"` | TIMESTAMPTZ | NULL | 終審時間 |
| `"final_review_notes"` | TEXT | NULL | 終審備註 |
| `"screenshot_url"` | TEXT | NULL | 截圖佐證 URL |
| `"created_at"` | TIMESTAMPTZ | now() | — |

**索引**:`user_id`、`status`、`quest_id` 單欄索引;以及 `(status, created_at)`、`(squad_name, status, created_at)`、`(battalion_name, status, created_at)` 複合索引

**TS interface**:`BonusApplication` ([types/index.ts:112](../types/index.ts#L112))

**常見查詢**

```sql
-- 某學員已通過的一次性任務
SELECT quest_id, interview_target, interview_date, final_review_at
FROM "BonusApplications"
WHERE user_id = '912345678' AND status = 'approved'
ORDER BY created_at;

-- 某大隊待大隊長終審
SELECT id, user_name, quest_id, interview_target, squad_review_by, squad_review_at
FROM "BonusApplications"
WHERE battalion_name = '光明大隊' AND status = 'squad_approved'
ORDER BY squad_review_at;

-- 統計各 quest_id 通過數
SELECT quest_id, COUNT(*) AS approved_count
FROM "BonusApplications"
WHERE status = 'approved'
GROUP BY quest_id ORDER BY approved_count DESC;
```

---

## 9. TempQuestApplications — 臨時任務申請 (temp_*)

**用途**:臨時任務(`temp_*`)的學員申請與審核記錄。同樣二級審核。

**狀態流**:同 BonusApplications

**PK**:`id` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `id` | UUID | gen_random_uuid() | **主鍵** |
| `quest_id` | TEXT | NOT NULL | `temp_*` 任務 ID |
| `quest_date` | TEXT | NOT NULL | 邏輯日期 YYYY-MM-DD |
| `user_id` | TEXT | NOT NULL | 學員 UserID |
| `user_name` | TEXT | NOT NULL | 學員姓名 |
| `team_name` | TEXT | NULL | 小隊名稱(供小隊長篩選) |
| `screenshot_url` | TEXT | NULL | 截圖佐證 |
| `note` | TEXT | NULL | 學員備註 |
| `status` | TEXT | `'pending'` NOT NULL | `pending` / `squad_approved` / `approved` / `rejected` |
| `squad_review_by` | TEXT | NULL | 初審者 |
| `squad_review_at` | TIMESTAMPTZ | NULL | — |
| `squad_review_notes` | TEXT | NULL | — |
| `final_review_by` | TEXT | NULL | 終審者 |
| `final_review_at` | TIMESTAMPTZ | NULL | — |
| `final_review_notes` | TEXT | NULL | — |
| `created_at` | TIMESTAMPTZ | now() NOT NULL | — |

**索引**:`(user_id)`、`(team_name, status)`

**TS interface**:`TempQuestApplication` ([types/index.ts:64](../types/index.ts#L64))
- 注意:TS 多一個 `quest_title` 欄位是 server 端 JOIN `temporaryquests` 後組進來的,**DB 沒有實體欄位**

---

## 10. TeamSettings — 小隊設定

**用途**:每小隊一筆,存 team_coins、每週指派任務、抽籤歷史。

**PK**:`"team_name"` (TEXT)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"team_name"` | TEXT | — | **主鍵** |
| `"team_coins"` | INTEGER | 0 | 小隊金幣 |
| `"inventory"` | JSONB | `[]` | 小隊道具庫存 |
| `"mandatory_quest_id"` | TEXT | NULL | 本週指派任務 ID |
| `"mandatory_quest_week"` | TEXT | NULL | 本週週一 YYYY-MM-DD |
| `"quest_draw_history"` | JSONB | `[]` | 抽籤歷史 |
| `"updated_at"` | TIMESTAMPTZ | now() | — |

**TS interface**:`TeamSettings` ([types/index.ts:35](../types/index.ts#L35))

---

## 11. MandatoryQuestHistory — 抽籤歷史

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"team_name"` | TEXT | NOT NULL | 小隊 |
| `"quest_id"` | TEXT | NOT NULL | 被抽到的任務 |
| `"week"` | TEXT | NOT NULL | 該週 YYYY-MM-DD(週一) |
| `"drawn_at"` | TIMESTAMPTZ | now() | 抽籤時間 |

---

## 12. SquadGatheringCheckins — 舊版 QR 掃碼報到

**用途**:早期 sq1-sq4 QR 掃碼報到記錄。新版 wk3_offline 流程改用 SquadGatheringSessions/Attendances。

**PK**:`"id"` (BIGSERIAL)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | BIGSERIAL | — | **主鍵** |
| `"gathering_id"` | TEXT | NOT NULL | 格式 `{themeId}\|{teamName}\|{YYYY-MM-DD}` |
| `"user_id"` | TEXT | NOT NULL | 學員 UserID |
| `"user_name"` | TEXT | NULL | 學員姓名 |
| `"checked_in_at"` | TIMESTAMPTZ | now() NOT NULL | — |

**唯一鍵**:`UNIQUE(gathering_id, user_id)`

**索引**:`(gathering_id)`、`(user_id)`

---

## 13. SquadGatheringSessions — wk3_offline 主檔

**用途**:實體小組凝聚場次主檔。狀態機:`scheduled → pending_review → approved`(或 `rejected` / `cancelled`)

**PK**:`id` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `id` | UUID | gen_random_uuid() | **主鍵** |
| `team_name` | TEXT | NOT NULL | 小隊 |
| `gathering_date` | DATE | NOT NULL | 凝聚日期 |
| `status` | TEXT | `'scheduled'` NOT NULL | 見下表 |
| `scheduled_by` | TEXT | NOT NULL | 管理員(排定者) |
| `captain_submitted_at` | TIMESTAMPTZ | NULL | 小隊長送審時間 |
| `captain_submitted_by` | TEXT | NULL | 小隊長 UserID |
| `commandant_reviewed_at` | TIMESTAMPTZ | NULL | 大隊長審核時間 |
| `approved_by` | TEXT | NULL | 大隊長 UserID |
| `approved_reward_per_person` | INTEGER | NULL | 每人入帳分數(核准時計算) |
| `approved_member_count` | INTEGER | NULL | 應到人數(小隊員數) |
| `approved_attendee_count` | INTEGER | NULL | 實際到場人數 |
| `approved_has_commandant` | BOOLEAN | NULL | 大隊長是否親自出席 |
| `notes` | TEXT | NULL | 備註 |
| `created_at` | TIMESTAMPTZ | now() NOT NULL | — |
| `updated_at` | TIMESTAMPTZ | now() NOT NULL | trigger 維護 |

**狀態**

| status | 意義 |
|--------|------|
| `scheduled` | 管理員已排定,尚未凝聚 |
| `pending_review` | 小隊長送出初審,等大隊長終審 |
| `approved` | 大隊長核准,已批次入帳 DailyLogs |
| `rejected` | 大隊長退回 |
| `cancelled` | 管理員於 scheduled 階段取消 |

**唯一鍵**:`UNIQUE(team_name, gathering_date)`

**索引**:`(team_name, gathering_date)`、`(status)`

---

## 14. SquadGatheringAttendances — wk3_offline 出席表

**用途**:SquadGatheringSessions 的出席明細(QR 掃描每位學員一筆)。

**PK**:`id` (BIGSERIAL)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `id` | BIGSERIAL | — | **主鍵** |
| `session_id` | UUID | NOT NULL | FK → `SquadGatheringSessions(id)` (ON DELETE CASCADE) |
| `user_id` | TEXT | NOT NULL | 學員 UserID |
| `user_name` | TEXT | NULL | 學員姓名 |
| `is_commandant` | BOOLEAN | false NOT NULL | 該筆是否為大隊長 |
| `scanned_at` | TIMESTAMPTZ | now() NOT NULL | — |

**唯一鍵**:`UNIQUE(session_id, user_id)`

**索引**:`(session_id)`、`(user_id)`

---

## 15. OnlineGatheringApplications — wk3_online 申請

**用途**:線上小組凝聚申請(僅一級審核,小隊長核准即入帳)。

**狀態**:`pending → approved`(或 `rejected`)

**PK**:`id` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `id` | UUID | gen_random_uuid() | **主鍵** |
| `user_id` | TEXT | NOT NULL | 學員 UserID |
| `user_name` | TEXT | NULL | 學員姓名 |
| `team_name` | TEXT | NOT NULL | 小隊 |
| `week_monday` | DATE | NOT NULL | 該週週一(Asia/Taipei) |
| `status` | TEXT | `'pending'` NOT NULL | `pending` / `approved` / `rejected` |
| `notes` | TEXT | NULL | 學員補充說明 |
| `squad_review_by` | TEXT | NULL | 小隊長 UserID |
| `squad_review_at` | TIMESTAMPTZ | NULL | — |
| `squad_review_notes` | TEXT | NULL | — |
| `created_at` | TIMESTAMPTZ | now() NOT NULL | — |
| `updated_at` | TIMESTAMPTZ | now() NOT NULL | trigger 維護 |

**唯一鍵**(部分索引):`uq_oga_user_week_active` UNIQUE(user_id, week_monday) WHERE status IN (`pending`, `approved`) — `rejected` 不擋,允許重送

**索引**:`(team_name, status)`、`(user_id)`

---

## 16. NineGridTemplates — 五大公版模板

**用途**:管理員設定的「事業運/財富運/情感運/家庭運/體能運」五大旅伴公版模板,學員建立 UserNineGrid 時複製進來。

**PK**:`"id"` (SERIAL)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | SERIAL | — | **主鍵** |
| `"companion_type"` | TEXT | NOT NULL UNIQUE | `事業運` / `財富運` / `情感運` / `家庭運` / `體能運` |
| `"cells"` | JSONB | `[]` | 陣列 9 個元素:`{label, description}` |
| `"cell_score"` | INTEGER | 100 NOT NULL | 每格完成分數 |
| `"updated_at"` | TIMESTAMPTZ | now() | — |

**TS interface**:`NineGridTemplate` ([types/index.ts:149](../types/index.ts#L149))

---

## 17. UserNineGrid — 學員個人九宮格

**用途**:每位學員一筆(或無)。從模板複製過來,可標記每格完成狀態。

**PK**:`"id"` (SERIAL)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | SERIAL | — | **主鍵** |
| `"member_id"` | TEXT | NOT NULL UNIQUE | 學員 UserID |
| `"companion_type"` | TEXT | NOT NULL | 旅伴類型(同模板五選一) |
| `"cells"` | JSONB | `[]` NOT NULL | 9 格:`{label, description, completed, completed_at}` |
| `"cell_score"` | INTEGER | 100 NOT NULL | 每格分數(連線額外 +3000) |
| `"created_at"` | TIMESTAMPTZ | now() | — |
| `"updated_at"` | TIMESTAMPTZ | now() | trigger 維護 |

**索引**:`idx_user_nine_grid_member` ON `"member_id"`

**TS interface**:`UserNineGrid` ([types/index.ts:162](../types/index.ts#L162))

**常見查詢**

```sql
-- 某學員九宮格完成狀態
SELECT member_id, companion_type,
  (SELECT COUNT(*) FROM jsonb_array_elements(cells) c WHERE (c->>'completed')::boolean) AS done_count
FROM "UserNineGrid"
WHERE member_id = '912345678';

-- 全班九宮格完成率
SELECT companion_type,
  COUNT(*) AS total_users,
  AVG((SELECT COUNT(*) FROM jsonb_array_elements(cells) c
       WHERE (c->>'completed')::boolean))::numeric(3,2) AS avg_done
FROM "UserNineGrid"
GROUP BY companion_type;
```

---

## 18. WeeklyRankSnapshot — 週榜歷史

**用途**:每週一 00:30(台灣)由 cron 寫入上週榜單。**本週榜**走 `aggregate_dailylogs_by_user` RPC 即時計算,不在此表。

**PK**:`id` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `id` | UUID | gen_random_uuid() | **主鍵** |
| `week_monday` | DATE | NOT NULL | 該週週一 YYYY-MM-DD(W1 為 `2026-05-10` 8 天特例) |
| `user_id` | TEXT | NOT NULL | — |
| `user_name` | TEXT | NULL | — |
| `team_name` | TEXT | NULL | 小隊 |
| `squad_name` | TEXT | NULL | 大隊 |
| `week_score` | INTEGER | 0 NOT NULL | 該週新增分數 |
| `cumulative_score` | INTEGER | 0 NOT NULL | 該週結束時 CharacterStats.Score |
| `created_at` | TIMESTAMPTZ | now() NOT NULL | — |

**唯一鍵**:`UNIQUE(week_monday, user_id)`

**索引**:`(week_monday, week_score DESC)`、`(user_id, week_monday DESC)`、`(team_name, week_monday)`

> **賽季週特例**:W1 為 5/10–5/17 共 8 天(`week_monday=2026-05-10`),W2 開始恢復週一→週日(`week_monday=2026-05-18`)。

**常見查詢**

```sql
-- 某週前 20 名
SELECT user_name, team_name, squad_name, week_score
FROM "WeeklyRankSnapshot"
WHERE week_monday = '2026-05-18'
ORDER BY week_score DESC LIMIT 20;

-- 某小隊本週總分
SELECT team_name, SUM(week_score) AS team_total
FROM "WeeklyRankSnapshot"
WHERE week_monday = '2026-05-18' AND team_name = '光明1小隊'
GROUP BY team_name;
```

---

## 19. MonthlyRankSnapshot — 月榜歷史

**用途**:每月 1 號 00:30(台灣)寫入上月榜單。

**PK**:`id` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `id` | UUID | gen_random_uuid() | **主鍵** |
| `month_start` | DATE | NOT NULL | YYYY-MM-01 |
| `user_id` | TEXT | NOT NULL | — |
| `user_name` | TEXT | NULL | — |
| `team_name` | TEXT | NULL | — |
| `squad_name` | TEXT | NULL | — |
| `month_score` | INTEGER | 0 NOT NULL | 該月新增分數 |
| `cumulative_score` | INTEGER | 0 NOT NULL | 該月結束時 CharacterStats.Score |
| `created_at` | TIMESTAMPTZ | now() NOT NULL | — |

**唯一鍵**:`UNIQUE(month_start, user_id)`

**索引**:`(month_start, month_score DESC)`、`(user_id, month_start DESC)`

---

## 20. CourseRegistrations — 親證曆報名

**用途**:親證曆(課程)報名。

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"user_id"` | TEXT | NOT NULL | 學員 UserID |
| `"course_key"` | TEXT | NOT NULL | 課程 key(對應 SystemSettings.CourseEvents 內的 id) |
| `"created_at"` | TIMESTAMPTZ | now() | 報名時間 |

**唯一鍵**:`UNIQUE(user_id, course_key)`

**TS interface**:`CourseRegistration` ([types/index.ts:172](../types/index.ts#L172))

---

## 21. CourseAttendance — 親證曆報到

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"user_id"` | TEXT | NOT NULL | — |
| `"course_key"` | TEXT | NOT NULL | — |
| `"checked_in_by"` | TEXT | `'admin'` | 掃碼志工 UserID,或 `'admin'` |
| `"attended_at"` | TIMESTAMPTZ | now() | 報到時間 |

**唯一鍵**:`UNIQUE(user_id, course_key)`

---

## 22. FinePayments — 個人罰款記錄

**用途**:個人罰款明細(小隊長記錄)。

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"user_id"` | TEXT | NOT NULL | 學員 UserID |
| `"user_name"` | TEXT | NULL | 學員姓名 |
| `"squad_name"` | TEXT | NULL | 大隊 |
| `"amount"` | INTEGER | 0 NOT NULL | 罰款金額 |
| `"period_label"` | TEXT | NULL | 結算區間文字(e.g. `2026-W12`) |
| `"paid_to_captain_at"` | TEXT | NULL | 已繳給小隊長日期 YYYY-MM-DD |
| `"submitted_to_org_at"` | TEXT | NULL | 已由小隊轉繳組織日期 |
| `"recorded_by"` | TEXT | NULL | 記錄者 |
| `"created_at"` | TIMESTAMPTZ | now() | — |

---

## 23. SquadFineSubmissions — 小隊向組織繳款

**用途**:小隊匯總後一筆繳款到組織。

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"squad_name"` | TEXT | NOT NULL | 大隊 |
| `"amount"` | INTEGER | 0 NOT NULL | 金額 |
| `"submitted_at"` | TEXT | NULL | 繳交日期 YYYY-MM-DD |
| `"recorded_by"` | TEXT | NULL | 記錄者 |
| `"notes"` | TEXT | NULL | 備註 |
| `"created_at"` | TIMESTAMPTZ | now() | — |

---

## 24. TopicHistory — 主題歷史

**用途**:管理員設定過的主題歷史。

**PK**:`"id"` (BIGINT, identity)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | BIGINT | identity | **主鍵** |
| `"TopicTitle"` | TEXT | NOT NULL | 主題標題 |
| `"created_at"` | TIMESTAMPTZ | now() NOT NULL | — |

---

## 25. Testimonies — LINE 見證回報

**用途**:LINE Bot 收到群組「見證」格式訊息時解析後寫入。

**PK**:`"id"` (UUID, auto)

### 欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `"id"` | UUID | gen_random_uuid() | **主鍵** |
| `"line_user_id"` | TEXT | NOT NULL | LINE userId |
| `"line_group_id"` | TEXT | NULL | LINE groupId |
| `"display_name"` | TEXT | NULL | LINE 顯示名稱 |
| `"parsed_name"` | TEXT | NULL | 解析出的學員姓名 |
| `"parsed_date"` | TEXT | NULL | 解析出的見證日期 |
| `"parsed_category"` | TEXT | NULL | 分類 |
| `"content"` | TEXT | NULL | 見證內容 |
| `"raw_message"` | TEXT | NULL | 原始訊息 |
| `"created_at"` | TIMESTAMPTZ | now() | — |

**索引**:`idx_testimonies_created_at` ON `"created_at" DESC`

---

## QuestID 對照(DailyLogs.QuestID)

### 基本定課(每日上限 3 項,各 200 分)

| QuestID | 名稱 |
|---------|------|
| `d1` | 五感恩 |
| `d2` | 餐前感恩 |
| `d3` | 嗯啊吽 |
| `d4` | 感恩冥想 |
| `d5` | 抄經 |
| `d6` | 光的冥想 |
| `d7` | 欣賞 |
| `d8` | 活在當下 |

### 加權定課(每日上限 3 項,各 500 分)

| QuestID | 名稱 |
|---------|------|
| `p1` | 打拳 |
| `p2` | 觀心書 |
| `p3` | 大悲咒 |
| `p4` | 子時入睡 |
| `p5` | 痛參 |

### 特殊加成

| QuestID | 名稱 | 說明 |
|---------|------|------|
| `p1_dawn` | 破曉打拳 | +500,需先完成 p1 |
| `diet_veg` | 三餐吃素 | +500,每日 diet 擇一 |
| `diet_seafood` | 三餐海鮮素 | +300,每日 diet 擇一 |

### 週課(QuestID 格式:`<prefix>|YYYY-MM-DD`,後綴為該週週一)

| QuestID 前綴 | 名稱 | 每週上限 | 分數 |
|-------------|------|---------|------|
| `wk1` | 破框練習 | 3 次 | 2000 |
| `wk2` | 天使通話 | 2 次 | 2000 |
| `wk3_online` | 小組凝聚(線上) | 1 次 | 1000 |
| `wk3_offline` | 小組凝聚(實體) | 1 次 | 3000(全到加 +1000、大隊長到加 +1000) |
| `wk4_small` | 人生大戲(小群) | 1 次,與 wk4_large 擇一 | 2000 |
| `wk4_large` | 人生大戲(大群) | 1 次,與 wk4_small 擇一 | 3000 |

> 範例:`wk1|2026-05-18` 表示 2026-05-18 那週的破框練習。

### 一次性任務(對應 BonusApplications)

| QuestID | 名稱 | 分數 | 審核 |
|---------|------|------|------|
| `o1` | 超越巔峰 | 10000 | 二級 |
| `o2_1` | 戲劇進修-生命數字 | 3000 | 一級 |
| `o2_2` | 戲劇進修-生命蛻變 | 10000 | 一級 |
| `o2_3` | 戲劇進修-複訓大堂課 | 3000 | 一級 |
| `o2_4` | 戲劇進修-告別負債&貧窮 | 3000 | 一級 |
| `o3` | 聯誼會(1 年) | 5000 | 二級 |
| `o4` | 聯誼會(2 年) | 15000 | 二級 |
| `o5` | 報高階(訂金) | 5000 | 二級,可多次 |
| `o6` | 報高階(完款) | 10000 | 二級,可多次 |
| `o7` | 傳愛 | 5000 | 二級,可多次 |
| `o8` | 圓夢計畫 | 10000 | 二級 |
| `o9` | 心成活動 | 視次數 | 一級,可多次 |

### 九宮格

| QuestID 格式 | 說明 |
|-------------|------|
| `nine_grid_cell\|0` ~ `nine_grid_cell\|8` | 完成第 N 格(+100,N=0..8) |
| `nine_grid_line\|cell0` ~ `nine_grid_line\|cell8` | 完成連線(+3000) |

### 臨時任務

| QuestID 格式 | 說明 |
|-------------|------|
| `temp_<unix_seconds>\|YYYY-MM-DD` | 臨時任務(對應 `temporaryquests.id`),後綴為邏輯日期 |

---

## RPC 函式速覽

> 用法:`SELECT * FROM <fn>(...)` 或 Supabase JS `supabase.rpc('<fn>', { ... })`。

| 函式名 | 輸入 | 輸出 | 用途 |
|--------|------|------|------|
| `process_checkin` | `user_id, quest_id, quest_title, quest_reward, logical_today` | `jsonb{success, user, error?}` | 原子打卡(含上限/重複檢查) |
| `clear_today_logs` | `user_id, logical_today` | `jsonb{success}` | 清除某人今天的打卡並反扣分 |
| `process_nine_grid_cell` | `member_id, cell_index` | `jsonb{success, lineBonus, newScore, user}` | 完成九宮格一格(含連線判定) |
| `uncomplete_cell_by_captain` | `captain_id, target_user_id, cell_index` | `jsonb{success, scoreReversed}` | 隊長/管理員撤銷某學員的某格 |
| `undo_nine_grid_cell_self` | `user_id, cell_index` | `jsonb{success, scoreReversed}` | 學員自撤(限本賽季週) |
| `aggregate_dailylogs_by_user` | `p_start timestamptz, p_end timestamptz` | rows: `user_id, user_name, team_name, squad_name, period_score, cumulative_score` | 本週/本月榜 live 聚合(撈期間累積分) |
| `get_distinct_week_mondays` | `p_limit int default 12` | rows: `week_monday DATE` | WeeklyRankSnapshot 已存週清單 |
| `get_distinct_month_starts` | `p_limit int default 12` | rows: `month_start DATE` | MonthlyRankSnapshot 已存月清單 |
| `season_week_start` | `p_ts timestamptz default now()` | `timestamptz` | W1=5/10(8天) / W2+=週一 |

---

## 常見撈取場景

### 1. 某學員 X 期間所有打卡明細

```sql
SELECT "Timestamp", "QuestID", "QuestTitle", "RewardPoints"
FROM "DailyLogs"
WHERE "UserID" = '912345678'
  AND "Timestamp" >= '2026-05-10 12:00:00+08'   -- 邏輯日 5/10 起
  AND "Timestamp" <  '2026-05-25 12:00:00+08'   -- 邏輯日 5/24 止
ORDER BY "Timestamp";
```

### 2. 某小隊某週總分(從快照)

```sql
SELECT team_name, SUM(week_score) AS team_total
FROM "WeeklyRankSnapshot"
WHERE week_monday = '2026-05-18' AND team_name = '光明1小隊'
GROUP BY team_name;
```

### 3. 本週榜(live 計算,不從快照)

```sql
SELECT *
FROM aggregate_dailylogs_by_user(
  '2026-05-18 00:00:00+08'::timestamptz,
  '2026-05-25 00:00:00+08'::timestamptz
)
ORDER BY period_score DESC LIMIT 50;
```

### 4. 待小隊長審核的線上凝聚

```sql
SELECT user_id, user_name, week_monday, created_at
FROM "OnlineGatheringApplications"
WHERE team_name = '光明1小隊' AND status = 'pending'
ORDER BY created_at;
```

### 5. 某大隊所有 admin / 大隊長 / 小隊長

```sql
SELECT "Name", "TeamName", "SquadRole",
       "IsCaptain", "IsCommandant", "IsAdmin"
FROM "CharacterStats"
WHERE "SquadName" = '光明大隊'
  AND ("IsAdmin" OR "IsCommandant" OR "IsCaptain")
ORDER BY "TeamName";
```

### 6. 某學員已通過的一次性任務

```sql
SELECT quest_id, interview_target, interview_date, final_review_at
FROM "BonusApplications"
WHERE user_id = '912345678' AND status = 'approved'
ORDER BY created_at;
```

### 7. 全班 5 大運命分數總排行

```sql
SELECT "Name", "SquadName",
  "Score_事業運", "Score_財富運", "Score_情感運", "Score_家庭運", "Score_體能運",
  COALESCE("Score_事業運",0)+COALESCE("Score_財富運",0)+COALESCE("Score_情感運",0)
  +COALESCE("Score_家庭運",0)+COALESCE("Score_體能運",0) AS fortune_total
FROM "CharacterStats"
ORDER BY fortune_total DESC NULLS LAST;
```

### 8. 某 wk3_offline 場次完整出席名單

```sql
SELECT s.team_name, s.gathering_date, s.status,
       s.approved_attendee_count, s.approved_member_count, s.approved_has_commandant,
       a.user_id, a.user_name, a.is_commandant, a.scanned_at
FROM "SquadGatheringSessions" s
LEFT JOIN "SquadGatheringAttendances" a ON a.session_id = s.id
WHERE s.team_name = '光明1小隊' AND s.gathering_date = '2026-05-20'
ORDER BY a.scanned_at;
```

### 9. 全班完成 N 格九宮格的人數

```sql
SELECT done_count, COUNT(*) AS users
FROM (
  SELECT member_id,
    (SELECT COUNT(*) FROM jsonb_array_elements(cells) c
     WHERE (c->>'completed')::boolean) AS done_count
  FROM "UserNineGrid"
) t
GROUP BY done_count ORDER BY done_count;
```

### 10. 某學員的所有罰款

```sql
SELECT amount, period_label, paid_to_captain_at, submitted_to_org_at, recorded_by
FROM "FinePayments"
WHERE user_id = '912345678'
ORDER BY created_at;
```

---

## ⚠️ 撈資料常見坑

### 1. **邏輯日期 vs 自然日期**

打卡用「邏輯日期」:**中午 12:00 為界**。

- 5/24 邏輯日 = 5/24 12:00 ~ 5/25 12:00 (台灣時間)
- 學員 5/24 上午 11:30 打卡 → 記在「5/23 邏輯日」
- 撈某天打卡時 timestamp 範圍要錯開 12 小時

### 2. **PascalCase 欄位必須 double-quote**

```sql
-- ❌ 錯
SELECT UserID, Score FROM CharacterStats;
-- ✅ 對
SELECT "UserID", "Score" FROM "CharacterStats";
```

PostgreSQL 不加引號會自動轉小寫,找不到欄位會回 error。

### 3. **5 大運命欄位名是中文,要 quote**

```sql
SELECT "Score_事業運" FROM "CharacterStats";  -- ✅
```

### 4. **賽季週特例:W1 = 8 天**

`week_monday=2026-05-10` 對應 5/10–5/17(8 天,因 5/17 是首日課程當天)。
其餘週(W2 起)都是標準週一→週日。

### 5. **大隊欄位有兩個名稱**

- `CharacterStats`:`SquadName`
- `BonusApplications`:同時有 `squad_name` 與 `battalion_name`,語意相同。撈資料時優先看 `battalion_name`(較新)

### 6. **soft delete?沒有**

學員「退賽」由管理員直接 DELETE,並用 `deleteMember` 連動清掉 10+ 張附屬表的資料。撈歷史時看不到已退賽學員的 CharacterStats,但 WeeklyRankSnapshot 等快照表可能仍有舊資料(若未連動清除)。

### 7. **screenshot_url 是 Supabase Storage URL**

bucket 為 `bonus-screenshots`(BonusApplications) 或 `temp-quest-screenshots`(TempQuestApplications)。直接用瀏覽器打開即可看(若 bucket 為 public)或加 signed URL(若為 private)。

### 8. **「總分」有兩個來源**

- `CharacterStats.Score`:**即時累積總分**(打卡 RPC 直接更新此欄)
- `WeeklyRankSnapshot.cumulative_score`:**該週結束當下**的快照,事後若有手動調整不會回追

對歷史報表用 snapshot;對「現在排名」用 CharacterStats.Score 或 `aggregate_dailylogs_by_user` RPC。

### 9. **QuestID 含 `|` 要 escape**

撈週課/九宮格時 QuestID 含 pipe:

```sql
SELECT * FROM "DailyLogs"
WHERE "QuestID" LIKE 'wk1|%';           -- 撈所有 wk1
SELECT * FROM "DailyLogs"
WHERE "QuestID" = 'wk1|2026-05-18';      -- 某週特定 wk1
```

### 10. **時區一律 Asia/Taipei**

- DB timestamptz 內部存 UTC,顯示時轉 Asia/Taipei
- 範例 SQL 統一用 `+08` 後綴顯式標注台灣時區避免歧義
- `date_trunc('week', ts AT TIME ZONE 'Asia/Taipei')` 才是正確的「台灣週一」

---

## 異動紀錄

| 日期 | 內容 |
|------|------|
| 2026-05-24 | 初版:21 張表 + RPC + QuestID 對照 + 10 個常見查詢 |
