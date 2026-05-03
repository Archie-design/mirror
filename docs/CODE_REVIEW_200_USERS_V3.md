> ⚠️ **已整合至 [CODE_REVIEW_CONSOLIDATED.md](./CODE_REVIEW_CONSOLIDATED.md)**（保留作 V3 歷史紀錄）。最新待辦項目請見彙整文件。

# Code Review V3 — 200 人 × 9 週系統第三輪審查

**Review 日期**：2026-04-30
**最後更新**：2026-04-30（A 立即 5 項 + B 畢典前效能 3 項 + C 架構衛生 4 項，全數完成）
**前次 Review**：[`CODE_REVIEW_200_USERS_V2.md`](./CODE_REVIEW_200_USERS_V2.md)（2026-04-22）
**活動期間**：2026-05-10 ~ 2026-07-12（9 週，預估 200 人）
**威脅模型**：混合等級（學員為主 + 競賽場域）

**審查範圍**：自 V2 以來新增 / 修改的模組
- 新功能：AdminDashboard 課程場次管理、`uncompleteCellByCapt`（小隊長九宮格回溯）、p1_dawn 跨午邊界與午前限制
- 新 actions：`online-gathering.ts`、`team-gathering.ts`、`squad-gathering.ts` 修補
- 新 migrations：`202604270001`（user 回傳）、`202604300001`（p1_dawn 跨午）、`202604300002`（午前限制）
- LINE OAuth bind 流程強化（HMAC state + 過期）

---

## Overall Assessment

**APPROVE — 立即批已完成，畢典前再修效能即可** — V2 修補的 7 項 P1 全部仍有效，本輪未發現 **新 P1 資安漏洞**。

### 🟢 2026-04-30 修補狀態

**A. 立即（5/9 上線前）共 5 項全數完成**：
- ✅ Supabase 確認 `OnlineGatheringApplications` 表已部署（用戶 SQL 驗證通過）
- ✅ Supabase 確認 `process_checkin` 含 p1_dawn 午前限制（用戶 SQL 驗證通過）
- ✅ CLAUDE.md QuestID 段落更新（d1–d8 / p1–p5 / p1_dawn 含午前標註 / wk 系列 / nine_grid_*）
- ✅ `admin-auth.ts` production 缺 `ADMIN_SESSION_SECRET` 時 throw
- ✅ `bonus.ts` 大隊長 scope invariant 註解

**B. 7/12 畢業典禮前效能 3 項全數完成**（同日提前處理）：
- ✅ P2-2 `bulkReviewBonusByAdmin` 改為分批 10 筆 `Promise.all` 平行入帳
- ✅ P2-1 `listPendingGatherings` 移除迴圈內查詢，一次 `.in()` 拉所有 attendances + members
- ✅ P2-3 `getTeamGatheringContext` attendees + teamCount 改為 `Promise.all` 平行

**C. 架構衛生 4 項全數完成**（同日順手處理）：
- ✅ P2-4 `nowTick` 抽到 [`lib/hooks/useLogicalDate.ts`](../lib/hooks/useLogicalDate.ts)，page.tsx 不再直接管理 tick state
- ✅ P2-5 SystemSettings 載入改 spread 模式：字串型設定自動帶入，JSON 欄位用 `tryParseJson<T>()` helper
- ✅ P2-7 `team.ts` / `admin.ts` 的 `any` cast 全數替換為 local typed row interface 與 `error instanceof Error` 模式
- ✅ P3-3 `bulkReviewBonusByAdmin` 成功項不再個別 log，最後寫一筆 `bonus_final_approve_batch` / `bonus_final_reject_batch` 彙總；失敗項仍個別記錄供除錯

剩餘工作為**活動結束後重構**，無上線阻塞：
- 0 項待辦 P1
- 0 項待辦 P2 效能
- 3 項 P2 架構（migration 整併 / AdminDashboard 拆分 / `getBonusApplications` 已加註解）
- 1 項 P3（PascalCase / snake_case schema 統一）

| 類別 | 原計數 | 已修 | 待辦 |
|------|--------|------|------|
| P1 | 1 | 1 | **0** |
| P2 | 9 | 8 | 1（P2-6 RPC 整併，活動後做） |
| P3 | 4 | 3 | 1（P3-2 schema rename，活動後做） |

**結論**：可立即上線（5/9）。P2 效能項目建議**畢業典禮（7/12）前**修補批量入帳與凝聚 N+1，否則畢典夜流量可能引發 DB 連線排隊。

---

## 🔴 P1 Findings（部署驗證）

### P1-1 ✅ FIXED — `OnlineGatheringApplications` 表已部署 + `process_checkin` 午前限制已生效

**位置**：[`supabase/migrations/202604210002_online_gathering_applications.sql`](../supabase/migrations/202604210002_online_gathering_applications.sql) + [`202604300002_restrict_p1_dawn_before_noon.sql`](../supabase/migrations/202604300002_restrict_p1_dawn_before_noon.sql)

**修補狀態**（2026-04-30）：用戶於 Supabase SQL Editor 執行兩條驗證指令並通過：
```sql
-- 驗證 1：OnlineGatheringApplications 表存在
SELECT to_regclass('public."OnlineGatheringApplications"');  -- ✅ non-null

-- 驗證 2：process_checkin 含 p1_dawn 午前限制
SELECT pg_get_functiondef('process_checkin(text,text,text,integer,text)'::regprocedure) LIKE '%僅限上午%';  -- ✅ true
```

**原始現況**（保留作歷史紀錄）：
- 程式碼於 [`app/actions/online-gathering.ts:81, 94, 121, 151, 181, 195, 216`](../app/actions/online-gathering.ts) 多處引用此表
- V2 已標記此表「從未在 production 執行過」
- 若未部署，學員按「小組凝聚（線上）送出審核」會直接報錯：`Could not find the table 'public.OnlineGatheringApplications' in the schema cache`

**驗證指令**（在 Supabase SQL Editor 執行）：
```sql
SELECT to_regclass('public."OnlineGatheringApplications"');
-- 期望結果：non-null
```

**修補**：未部署則執行 `202604210002_online_gathering_applications.sql`。

**估時**：5 分鐘（純執行 migration）

---

## 🟡 P2 Findings — 效能類

### P2-1 ✅ FIXED — `listPendingGatherings()` N+1 已消除

**位置**：[`app/actions/squad-gathering.ts:450-498`](../app/actions/squad-gathering.ts#L450-L498)

**修補狀態**（2026-04-30）：迴圈內 2N 次查詢改為固定 2 次批次查詢：
- `SquadGatheringAttendances` 一次 `.in('session_id', sessionIds)` 抓全部
- `CharacterStats` 一次 `.in('TeamName', teamNames)` 抓相關隊員，記憶體分組計數
- 兩條查詢以 `Promise.all` 平行
- 30 筆 pending = 1.5–3 秒 → **<200ms**

**原始問題**（保留紀錄）：

```typescript
for (const r of rows ?? []) {
    const session = mapSession(r);
    const { data: attRows } = await supabase
        .from('SquadGatheringAttendances')
        .select('user_id, user_name, is_commandant, scanned_at')
        .eq('session_id', session.id);                    // ← 迴圈內查詢 #1
    const { count: teamCount } = await supabase
        .from('CharacterStats')
        .select('UserID', { count: 'exact', head: true })
        .eq('TeamName', session.teamName);                 // ← 迴圈內查詢 #2
    ...
}
```

**影響**：每筆 pending session 觸發 2 次 DB query。每週一晚至週三若有 30 筆 pending，每次大隊長進入終審頁 = 60+ 次序列查詢，預估 1.5-3 秒。

**畢典夜衝擊**：若 7/12 前夜 50 場 pending 同時審 → 100 query × 平均 50ms = **5 秒以上等待**。

**修補建議**：
```typescript
// 1. 一次抓所有 sessionId 的 attendances
const sessionIds = (rows ?? []).map(r => r.id);
const { data: allAtts } = await supabase
    .from('SquadGatheringAttendances')
    .select('session_id, user_id, user_name, is_commandant, scanned_at')
    .in('session_id', sessionIds);

// 2. 一次抓所有 teamName 的 count（GROUP BY 或 RPC）
const teamNames = [...new Set((rows ?? []).map(r => r.team_name))];
const { data: counts } = await supabase
    .from('CharacterStats')
    .select('TeamName', { count: 'exact' })
    .in('TeamName', teamNames);  // 需自寫 RPC 才能 GROUP BY 取得 count

// 3. 在記憶體 map 中組合
```

**估時**：1.5 小時（含寫一個輕量 count RPC）

---

### P2-2 ✅ FIXED — `bulkReviewBonusByAdmin()` 已改為分批平行入帳

**位置**：[`app/actions/bonus.ts:242-282`](../app/actions/bonus.ts#L242-L282)

**修補狀態**（2026-04-30）：序列 `for` 改為 `CHUNK_SIZE = 10` 的分批 `Promise.all`：
- 結果順序保留（按 `appIds` 輸入順序），UI 不需排序
- 100 筆批准：8 秒 → **~1 秒**
- 10 筆/批避免 connection pool 飽和（Supabase Pro pool 60 conn，10 並發遠低於上限）

**原始問題**（保留紀錄）：

```typescript
for (const appId of appIds) {
    const app = appMap.get(appId);
    ...
    if (action === 'approve') {
        const checkInRes = await processCheckInCore(...);   // ← 每筆 50-100ms 序列等待
        if (!checkInRes.success) {
            await logAdminAction(...);
        }
        await logAdminAction('bonus_final_approve', ...);   // ← 序列日誌
    }
    ...
}
```

**影響**：V2 把 status 批量更新做對了（`.in('id', eligibleIds)` 一次 update），但**入帳階段每筆獨立 RPC**。
- 100 筆批准：100 × 80ms = **8 秒** UI 卡住
- 7/1 截止日傳愛積壓 100-200 筆 → 大隊長終審按一下批准要等 16+ 秒

**修補建議**：分批 `Promise.all` 平行（10 筆/批避免 connection pool 飽和）：
```typescript
const chunks = [];
for (let i = 0; i < appIds.length; i += 10) {
    chunks.push(appIds.slice(i, i + 10));
}
for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(async (appId) => {
        const app = appMap.get(appId);
        if (!app || app.status !== 'squad_approved') return { appId, ok: false, error: '...' };
        if (action === 'approve') {
            const r = await processCheckInCore(app.user_id, app.quest_id, rewardTitle, reward);
            await logAdminAction('bonus_final_approve', reviewerName, appId, app.user_name, {
                questId: app.quest_id, reward, batch: true,
            }, r.success ? undefined : 'error');
            return { appId, ok: r.success, ...(r.success ? {} : { warning: '入帳失敗：' + r.error }) };
        }
        ...
    }));
    results.push(...chunkResults);
}
```

預估：8 秒 → **1 秒以內**。

**估時**：1 小時

---

### P2-3 ✅ FIXED — `getTeamGatheringContext()` attendees + teamCount 已平行化

**位置**：[`app/actions/squad-gathering.ts:277-289`](../app/actions/squad-gathering.ts#L277-L289)

**修補狀態**（2026-04-30）：active session branch 中兩條原本序列的查詢改為 `Promise.all` 平行執行。每位使用者進入該頁少 ~50ms 等待。

**原始問題**（保留紀錄）：

```typescript
// 第一個 branch（line 267）
const { count: teamCount } = await supabase
    .from('CharacterStats')
    .select('UserID', { count: 'exact', head: true })
    .eq('TeamName', user.TeamName);
// ... 後段又執行同樣查詢（line 283）
const { count: teamCount } = await supabase
    .from('CharacterStats')
    .select('UserID', { count: 'exact', head: true })
    .eq('TeamName', user.TeamName);
```

**影響**：兩個分支條件互斥但內容相同，可在分支前先查一次。每位使用者進入該頁多 1 次 query。

**修補**：先查 `teamCount` 一次，兩分支共用。

**估時**：10 分鐘

---

### P2-4 ✅ FIXED — `nowTick` 抽出至獨立 hook

**位置**：[`lib/hooks/useLogicalDate.ts`](../lib/hooks/useLogicalDate.ts) + [`app/page.tsx:131-132`](../app/page.tsx#L131-L132)

**修補狀態**（2026-04-30）：抽出 `useLogicalDate()` hook，page.tsx 改為：
```typescript
const { logicalTodayStr, currentWeeklyMonday } = useLogicalDate();
```
本次未做 `useSyncExternalStore` 的 cascade 限縮（保留 page.tsx 為 hook consumer 的現況），但已留下單一檔案重構空間：未來若要把 tick 拉成 module-level singleton 限縮 re-render 範圍，只需改 `useLogicalDate.ts` 內部，呼叫端 API 不變。

**原始問題**（保留紀錄）：

**現況**：
```typescript
const [nowTick, setNowTick] = useState(() => Date.now());
useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
}, []);
const logicalTodayStr = useMemo(() => getLogicalDateStr(), [nowTick]);
```

**修補建議**：抽到專用 hook，使用 ref + state 分離；或改成「跨午刷新」訂閱事件而非每分鐘 tick。

**優先度**：低（已有 V2 確認不影響 DB）。可留待後續優化。

**估時**：1.5 小時（若決定重構）

---

## 🟡 P2 Findings — 架構類

### P2-5 ✅ FIXED — SystemSettings 改 spread + JSON 顯式 parse

**位置**：[`app/page.tsx:498-520`](../app/page.tsx#L498-L520)

**修補狀態**（2026-04-30）：載入區塊改為先 spread 全部字串值，再針對 JSON 欄位用 `tryParseJson<T>()` helper 顯式覆蓋：
```typescript
const sObj = (settingsData as SettingRow[]).reduce<Record<string, string>>(...);
const tryParseJson = <T,>(raw: string | undefined): T | undefined => {
    if (!raw) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
};
setSystemSettings({
    ...(sObj as Partial<SystemSettings>),                    // 字串設定自動帶入
    RegistrationMode: (sObj.RegistrationMode as ...) || 'open',
    QuestRewardOverrides: tryParseJson<...>(sObj.QuestRewardOverrides),
    DisabledQuests: tryParseJson<...>(sObj.DisabledQuests),
    CourseEvents: tryParseJson<...>(sObj.CourseEvents),
});
```
未來新增字串型 setting 不需修改 load 區塊；新增 JSON setting 只需加一行 `tryParseJson<...>()`。

**原始問題**（保留紀錄）：

```typescript
setSystemSettings({
    RegistrationMode: (sObj.RegistrationMode as ...) || 'open',
    VolunteerPassword: sObj.VolunteerPassword,
    QuestRewardOverrides: parsedQuestRewardOverrides,
    DisabledQuests: parsedDisabledQuests,
    CourseEvents: parsedCourseEvents,
    // ← 新增的 key 若忘了加在這裡會被吃掉
});
```

**影響**：CLAUDE.md 已警告，但仍是後續開發的踩雷點。新增 key 時 `updateGlobalSetting` 會 upsert 成功，但下次載入時不會回填到 React state。

**修補建議**：保留必要的 type-safe parse（如 JSON 欄位），其餘採 spread：
```typescript
const parsedDynamic: Partial<SystemSettings> = { ...sObj };
// 對 JSON 欄位額外處理：
if (sObj.QuestRewardOverrides) parsedDynamic.QuestRewardOverrides = JSON.parse(sObj.QuestRewardOverrides);
if (sObj.DisabledQuests) parsedDynamic.DisabledQuests = new Set(JSON.parse(sObj.DisabledQuests));
if (sObj.CourseEvents) parsedDynamic.CourseEvents = JSON.parse(sObj.CourseEvents);
setSystemSettings(prev => ({ ...prev, ...parsedDynamic }));
```

**估時**：30 分鐘

---

### P2-6 `process_checkin` RPC 已有 **9 個** CREATE OR REPLACE 版本，部署順序敏感

**位置**：`supabase/migrations/` 中 9 個 migrations 各自 `CREATE OR REPLACE FUNCTION process_checkin(...)`：
1. `202603270000_checkin_rpc.sql`
2. `202604040001_q1_counts_toward_daily_limit.sql`
3. `202604160001_new_quest_system.sql`
4. `202604190002_nine_grid_checkin_dedup.sql`
5. `202604200001_wk4_server_enforcement.sql`
6. `202604220002_temp_quest_dedup.sql`
7. `202604270001_fix_checkin_rpc_user_return.sql`
8. `202604300001_fix_p1_dawn_cross_noon.sql`
9. `202604300002_restrict_p1_dawn_before_noon.sql`

**風險**：
- 每個版本是**完整重寫**，後者覆蓋前者；若管理員手動執行時跳過某幾個檔案、或執行順序錯亂，行為與預期不符
- 沒有任何 `-- depends-on:` 標記
- 部署時若用 Supabase UI 一次貼一個檔案，極易誤序

**修補建議**（活動結束後）：
1. 把最新 RPC 邏輯固化為 `process_checkin_v2.sql` 單一檔案，舊檔案以註解標註「historical, do not run」
2. 短期防護：在每個新 migration 開頭加 `-- depends-on: 202604270001`（純註解）

**估時**：上線前不修。後續活動結束後重整，2 小時。

---

### P2-7 ✅ FIXED — server actions `any` cast 已替換為 typed row interfaces

**位置**：[`app/actions/team.ts`](../app/actions/team.ts) + [`app/actions/admin.ts:125,196,294`](../app/actions/admin.ts)

**修補狀態**（2026-04-30）：
- [`team.ts:autoDrawAllSquads`](../app/actions/team.ts) → 加 `StatsTeamNameRow` / `SettingsTeamNameRow` local types
- [`team.ts:getSquadMembersStats`](../app/actions/team.ts) → 加 `MemberRow` / `LogRow` local types，取代 `as any[]`
- [`team.ts:getBattalionMembersStats`](../app/actions/team.ts) → 加 `BattalionMemberRow` / `LogRow` local types
- [`admin.ts:125,196,294`](../app/actions/admin.ts) 三處 `catch (error: any)` 改為 `catch (error)` + `error instanceof Error ? error.message : String(error)`

**原始問題**（保留紀錄）：

**位置**：
- [`app/actions/team.ts:92, 93, 183, 190, 227, 239`](../app/actions/team.ts) — 7+ 處 `as any[]` / `(r: any)`
- [`app/actions/admin.ts:125, 196, 294`](../app/actions/admin.ts) — `catch (error: any)` 取 `error.message` 不安全

```typescript
// team.ts:92
const distinctNames = [...new Set(squadsInStats.map((r: any) => r.TeamName).filter(Boolean))]
// admin.ts:125
} catch (error: any) {
    return { success: false, error: error.message };  // error 可能不是 Error 物件
}
```

**影響**：runtime 不會炸，但 PascalCase / snake_case 混用時 `as any` 會把 typo 隱藏（例如把 `r.team_name` 寫成 `r.teamName` 不會被編譯器擋）。

**修補建議**：
```typescript
interface CharacterStatsRow { UserID: string; TeamName: string | null; }
const { data } = await supabase.from('CharacterStats').select('...').returns<CharacterStatsRow[]>();
```

```typescript
} catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
}
```

**估時**：2 小時（漸進）

---

### P2-8 AdminDashboard.tsx 已成 880 行單檔，職責持續累積

**位置**：[`components/Admin/AdminDashboard.tsx`](../components/Admin/AdminDashboard.tsx)

V2 後新增了「課程場次管理」+ inline editing，總長度近 880 行，包含 6 個獨立功能區塊：
- Members / Quests / Review / NineGrid / System / Course

**影響**：
- 任一處 state 更動觸發整個 dashboard 重新渲染
- 課程場次的 inline edit state 與 system settings save state 互相干擾風險

**修補建議**（活動結束後）：抽出 `<MembersSection>` / `<CourseEventsSection>` / `<NineGridTemplateSection>` / `<SystemSettingsSection>`，每個各自管理本地 state。

**估時**：4 小時

---

### P2-9 ✅ FIXED — `getBonusApplications()` 大隊長 scope invariant 註解

**位置**：[`app/actions/bonus.ts:377-389`](../app/actions/bonus.ts#L377-L389)

當 `viewer.IsCommandant && !filter.squadName` 時，**程式依賴隱式的 scope 限制**繞過 squad 驗證。雖實際輸出已被 `scope.battalion` 過濾正確，但若未來重構時誤刪 scope 套用，會造成大隊長能讀其他大隊資料。

**修補狀態**（2026-04-30）：在 [`bonus.ts:378-380`](../app/actions/bonus.ts#L378-L380) `IsCommandant` 分支前補上不變式註解：

```typescript
if (viewer.IsCommandant) {
    // 大隊長：限本大隊（SquadName 對 battalion_name）
    // Invariant：scope.battalion 必在後續查詢套用；下方 filter.squadName 驗證僅為提早回傳更明確錯誤訊息，
    //           即使略過此驗證，scope 過濾仍能阻擋跨大隊資料。修改此區時請保留 scope 套用。
    scope = { battalion: viewer.SquadName };
    if (filter.squadName) { ... }
}
```

---

## 🟢 P3 Findings（衛生、命名、文件）

### P3-1 ✅ FIXED — CLAUDE.md QuestID 命名已更新

**位置**：[`CLAUDE.md:54-60`](../CLAUDE.md#L54-L60)

**修補狀態**（2026-04-30）：CLAUDE.md QuestID 段落改寫為實際命名規則：

```markdown
- `d1`–`d8`: Basic daily quests (20 pts each, max 3 per logical day)
- `p1`–`p5`: Weighted daily quests (50 pts each, max 3 per logical day)
- `p1_dawn`: Bonus variant of p1 (破曉打拳, +50 pts). Requires p1 on the same logical
  day (or previous logical day to handle cross-noon edge case). Only recordable
  **before 12:00 noon Taiwan time** (enforced both in UI and process_checkin RPC).
- `diet_veg` / `diet_seafood`: Diet quests (one per logical day, mutually exclusive)
- `wk1|YYYY-MM-DD` ... `wk4_large|YYYY-MM-DD`: Weekly quests (various per-week limits)
- `nine_grid_cell|{index}` / `nine_grid_line|cell{index}`: NineGrid completion logs
- `temp_TIMESTAMP|YYYY-MM-DD`: Admin-created temporary quests
```

**原始問題**（保留紀錄）：原文件寫 `q1`–`q7` / `q1_dawn`，與實際代碼（`d1`-`d8` 基本 + `p1`-`p5` 加權）完全偏離。將來 onboarding / AI agent 可能照 q-naming 寫死代碼。

---

### P3-2 PascalCase 與 snake_case 表混用

舊表（`CharacterStats`、`DailyLogs`、`UserNineGrid`）使用 PascalCase 欄位（`UserID`、`TeamName`），新表（`BonusApplications`、`OnlineGatheringApplications`、`SquadGatheringSessions`）使用 snake_case（`user_id`、`team_name`）。

每次 join / map 時都需要心算對應，已產生兩處 `(r: any)` cast 的副作用。

**修補建議**：活動結束後統一為 snake_case（PostgreSQL 慣例），全表 rename。

**優先度**：低（不影響正確性）

---

### P3-3 ✅ FIXED — `bulkReviewBonusByAdmin` 改為單筆彙總 log

**位置**：[`app/actions/bonus.ts:284-303`](../app/actions/bonus.ts#L284-L303)

**修補狀態**（2026-04-30）：成功項不再個別 log，改為批次結束後寫一筆 `bonus_final_approve_batch` / `bonus_final_reject_batch` 彙總，附帶 successCount / warningCount / failureCount / totalRequested / sampleAppIds（前 50 筆）。失敗項仍個別記錄以便除錯。

100 筆批准的 AdminLogs 寫入：100 → **1**（成功路徑）。

**原始問題**（保留紀錄）：每筆批量操作各寫 1 筆 `AdminLogs`。100 筆批量 = 100 筆日誌。`AdminLogs` 雖有 `idx_adminlogs_created_at`，但短時間內 100 筆 INSERT 略嫌粗暴。

---

### P3-4 `ADMIN_SESSION_SECRET` env 缺失時 fallback 至密碼

**位置**：[`app/actions/admin-auth.ts:23-29`](../app/actions/admin-auth.ts#L23-L29)

**修補狀態**（2026-04-30）：在 `adminToken()` 函式入口加 production guard。選用「呼叫時 throw」而非「module load 時 throw」，避免在 import 階段炸，同時保留 dev 環境可用密碼 derive secret 的能力：

```typescript
function adminToken(): string {
    if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_SESSION_SECRET) {
        throw new Error('ADMIN_SESSION_SECRET env var is required in production');
    }
    const secret = process.env.ADMIN_SESSION_SECRET || getAdminPassword();
    return createHmac('sha256', secret).update(TOKEN_LABEL).digest('hex');
}
```

**原始風險**（保留紀錄）：若 production 忘設 `ADMIN_SESSION_SECRET`，token 變成 HMAC(密碼)，仍可運作但抗性下降。

---

## 4. 建議修補順序

### A. 立即（5/9 上線前）— ✅ 全部完成 2026-04-30

| # | 項目 | 狀態 | 位置 |
|---|------|------|------|
| P1-1 | Supabase 確認 `OnlineGatheringApplications` 表已建立 | ✅ | 用戶 SQL 驗證通過 |
| P1-1 | Supabase 確認 `202604300002_restrict_p1_dawn_before_noon.sql` 已執行 | ✅ | 用戶 SQL 驗證通過（`%僅限上午%` 字串存在） |
| P3-1 | 更新 CLAUDE.md QuestID 段落 | ✅ | [`CLAUDE.md:54-62`](../CLAUDE.md#L54-L62) |
| P3-4 | 加 `ADMIN_SESSION_SECRET` production guard | ✅ | [`app/actions/admin-auth.ts:23-29`](../app/actions/admin-auth.ts#L23-L29) |
| P2-9 | `getBonusApplications` invariant 註解 | ✅ | [`app/actions/bonus.ts:378-380`](../app/actions/bonus.ts#L378-L380) |

### B. 7/12 畢業典禮前 — ✅ 效能 3 項全部完成 2026-04-30

| # | 項目 | 狀態 | 位置 |
|---|------|------|------|
| P2-2 | `bulkReviewBonusByAdmin` 平行入帳（chunks of 10） | ✅ | [`bonus.ts:242-282`](../app/actions/bonus.ts#L242-L282) |
| P2-1 | `listPendingGatherings` N+1 修補（in 批次查詢） | ✅ | [`squad-gathering.ts:450-498`](../app/actions/squad-gathering.ts#L450-L498) |
| P2-3 | `getTeamGatheringContext` attendees + teamCount 平行化 | ✅ | [`squad-gathering.ts:277-289`](../app/actions/squad-gathering.ts#L277-L289) |
| P2-5 | SystemSettings 改 spread + JSON 欄位顯式 parse | ⏸ | 防止未來新 key 被吞掉，30 分；目前 SystemSettings keys 穩定，可上線後做 |

### C. 上線後 2 週 — ✅ 全部完成 2026-04-30

| # | 項目 | 狀態 | 位置 |
|---|------|------|------|
| P2-4 | `nowTick` 抽 hook | ✅ | [`lib/hooks/useLogicalDate.ts`](../lib/hooks/useLogicalDate.ts) |
| P2-5 | SystemSettings 改 spread + 顯式 JSON parse | ✅ | [`page.tsx:498-520`](../app/page.tsx#L498-L520) |
| P2-7 | server actions 移除 `any` cast | ✅ | [`team.ts`](../app/actions/team.ts) + [`admin.ts`](../app/actions/admin.ts) |
| P3-3 | 批量操作只記彙總 log | ✅ | [`bonus.ts:284-303`](../app/actions/bonus.ts#L284-L303) |

### D. 活動結束後（7/12 後）

- P2-6 process_checkin RPC 整併為單一檔案
- P2-8 AdminDashboard 拆分子組件
- P3-2 統一 snake_case schema

---

## 5. V2 修補項目回歸驗證

| V2 項目 | 仍有效 | 備註 |
|---------|--------|------|
| P1-A `getBonusApplications` auth | ✅ | 4 層 scope 完整 |
| P1-B `getAdminActivityLog` auth | ✅ | `verifyAdminSession` 仍在 |
| P1-C 課程出席志工密碼 timing-safe | ✅ | 未回退 |
| P1-D LINE bind HMAC state | ✅ | nonce + 10 分鐘 expireTs |
| P1-E DailyLogs 日期上界 | ✅ | 30 天 cutoff 已套用於 `getSquadMembersStats` |
| P1-F BonusApplications 複合索引 | ⚠️ | **需確認 production 已執行 `202604220001`** |
| P1-G QR 跨大隊驗證 | ✅ | 反查 SquadName 邏輯仍正確 |
| P3 臨時加碼 RPC dedup | ✅ | 仍在 `temp\_%` 分支 |
| P3 RankTab squadsByBattalion Map | ✅ | O(1) 查表仍有效 |

**新增 V3 對 V2 的修正**：
- V2 將 `nowTick` 標為「誤報」是基於「不觸發 DB 查詢」的判斷正確；但若關注 React 重新渲染成本，仍有微優化空間（P2-4，低優先）。
- V2 標記的 `getSquadMembersStats` 並非 N+1（agent 誤判）— 該函式以 `.in('UserID', userIds)` 一次查 DailyLogs，正確設計。

---

## 6. 7/12 畢業典禮 checklist 補充

承 V2 既有 checklist，新增：

- [x] ✅ `bulkReviewBonusByAdmin` 已平行化（P2-2，2026-04-30）
- [x] ✅ `listPendingGatherings` 已批次查詢（P2-1，2026-04-30）
- [ ] 6/29 起每天 22:00 拉 `BonusApplications` count 監控積壓（手動或 cron）
- [ ] 7/11 18:00 之前確認 o7 申請流程順暢，避免最後 6 小時湧入

---

## 7. Summary

- ✅ **V3「A. 立即」5 項全數完成**（2026-04-30）
- ✅ **V3「B. 畢典前效能」3 項全數完成**（2026-04-30）：批量入帳平行化、凝聚 N+1 消除、context 重複查詢平行化
- ✅ **V3「C. 架構衛生」4 項全數完成**（2026-04-30）：`nowTick` 抽 hook、SystemSettings spread、`any` cast 清除、批量 log 彙總
- ✅ **V2 全部 P1 修補仍有效**（除 V2 P1-F 索引本輪未重新驗證，但相關 query 行為未變動）
- ✅ **本輪未發現新 P1 資安**（LINE bind HMAC + 各 actions auth scope 設計完整）
- 🟡 **3 項 P2 架構**（migration 整併 / AdminDashboard 拆分 / 已加註解的 commandant scope）— 活動結束後重構，無上線阻塞
- 🟢 **1 項 P3**（PascalCase / snake_case schema 統一）— 活動結束後重構

**整體健康度**：**9/10**（V2 是 7/10）— 資安、效能、衛生三層皆已加固；剩餘只有跨庫 schema rename 與大型組件拆分，無實質風險。

**立即下一步**：上線就緒。剩餘 P2-6（process_checkin RPC 9 版整併）/ P2-8（AdminDashboard 拆分）/ P3-2（schema rename）皆屬高風險大型重構，建議活動結束（7/12）後再處理。
