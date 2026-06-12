# Design — 階段 0：多租戶 scope 地基

## 目標形狀（回顧，本 change 只做地基那層）

```
        官網 Portal (發 session)
          │ shared cookie + LINE 登入
   ┌──────┼───────────┬──────────┐
   ▼      ▼           ▼          ▼
 親證班2026 親證班2027  小天使   (forked 前端：只 fork 設定/主題/UI)
   └──────┴───────────┴──────────┘
          全部寫進 ↓ 同一 Supabase（共用 schema + 引擎）
   Accounts(身分)  ← 階段 1
   Participation(account,app,season) ← 階段 1
   DailyLogs(app_id, season_id, …)   ← ★階段 0 在此種欄位
   *Snapshot / Gathering* / Quests(app_id, season_id, …)
```

階段 0 = 只把 `app_id`/`season_id` 種進「賽季帳本/產物表」，**行為不變**（單租戶、DEFAULT 回填、讀取不加 filter）。後面階段才啟用多寫入者與拆分。

## 為什麼現在做（賽季中）安全且必要

- **安全**：加 `NOT NULL DEFAULT` 欄位是純 additive；既有 SELECT 不選它、結果不變；既有 INSERT 由 DEFAULT 補值。
- **必要**：scope 必須在「第二批資料混入前」就存在。等小天使/2027 寫入後再加，無法把混合的歷史正確分回各租戶。

## 表分類（scoped vs 暫不動）

**加 scope（賽季帳本/產物，本 change 範圍）**——規則：凡是「屬於某一賽季的事件、申請、快照、產物」：
```
DailyLogs, WeeklyRankSnapshot, MonthlyRankSnapshot,
SquadGatheringSessions, SquadGatheringAttendances, SquadGatheringCheckins,
OnlineGatheringApplications, WeeklyPracticeApplications,
TempQuestApplications, TemporaryQuests, BonusApplications,
UserNineGrid, TeamSettings, TopicHistory, MandatoryQuestHistory,
Testimonies, FinePayments, SquadFineSubmissions,
CourseRegistrations, CourseAttendance, MapEntities, Achievements
```

**暫不動（階段 1+ 或全域）**——理由標注：
```
CharacterStats   身分+狀態混合體 → 階段 1 才劈成 Accounts/Participation
SystemSettings   目前全域設定；未來可改 app 級
Rosters          匯入暫存
LineGroups       全域
NineGridTemplates 可視為全域模板（待定）
AdminActivityLog  跨切稽核（可選擇加 app_id，本階段不強制）
```

## 欄位與索引

```sql
ALTER TABLE "<scoped>"
  ADD COLUMN "app_id"    TEXT NOT NULL DEFAULT 'qinzheng',
  ADD COLUMN "season_id" TEXT NOT NULL DEFAULT '2026';
```
熱查詢表補複合索引，把 scope 放最前綴：
```sql
-- 例：排行聚合 / 每日去重
CREATE INDEX ON "DailyLogs" ("app_id","season_id","UserID","Timestamp");
-- 快照查詢
CREATE INDEX ON "MonthlyRankSnapshot" ("app_id","season_id","month_start");
```

## 單一 scope 來源

`lib/scope.ts`：
```
export const CURRENT_APP_ID = 'qinzheng';     // 之後改讀 process.env.APP_ID
export const CURRENT_SEASON_ID = '2026';      // 之後改讀 process.env.SEASON_ID
export function scopedFrom(table) { /* supabase.from(table) 預掛 app/season 慣例 */ }
```
forked 部署（2027/小天使）只改這兩個值（或環境變數）即指向自己的 scope——這正是「換皮 = fork 設定層」落地點。

## 寫入端

- `processCheckInCore`：insert DailyLogs 時帶 `app_id/season_id`（取自 scope 來源）。
- 其餘主要 insert（gathering/applications/temp/nine-grid…）同樣帶上。
- 即使漏帶，DB DEFAULT 也會補成當前賽季 → 階段 0 不會出錯；但顯式寫入是為階段 1 多租戶鋪路。

## 讀取端：本階段「不」全面改

- 全面把 ~27 表的讀取改帶 scope 是大工程、賽季中有回歸風險 → **留待階段 1**。
- 階段 0 只：① 建立 `scopedFrom` helper；② 訂慣例「新程式碼 scoped 表走 helper」；③ 既有讀取維持原樣（單租戶下加不加 filter 結果相同）。

## 為何「不」現在就上 scope-enforcing RLS

單租戶階段，RLS 加 scope 條件沒有實際隔離效益，反而增加賽季中改 policy 的風險。等真正有第二租戶（階段 3 前）再隨之啟用。

## 相容性

- 與 `unify-score-period-attribution` 獨立：那個改 Timestamp 寫入值，這個加 scope 欄位，互不干涉。
- 不改 `aggregate_dailylogs_by_user`：階段 0 仍單租戶，聚合不需帶 scope；階段 1 啟用多租戶時再讓 RPC/呼叫端帶 `app_id/season_id`。

## 風險

- 低。最大風險是「加欄位的 migration 在大表（DailyLogs）上鎖表時間」——`NOT NULL DEFAULT` 在 Postgres 11+ 為 metadata-only、不重寫整表，安全；仍建議低峰執行並先在備援/分支驗證。
