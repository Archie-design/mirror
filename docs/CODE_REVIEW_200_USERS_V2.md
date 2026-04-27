# Code Review V2 — 200 人 × 9 週系統整體審查

**Review 日期**：2026-04-22
**前次 Review**：[`CODE_REVIEW_200_USERS.md`](./CODE_REVIEW_200_USERS.md)（2026-04-20）
**活動期間**：2026-05-10 ～ 2026-07-12（9 週，預估 200 人）
**威脅模型**：混合等級（學員為主 + 競賽場域；可繞過計分漏洞視為 P1）

**審查範圍**：自 v1 以來新增 / 修改的模組
- **Auth 層**：`lib/auth.ts`（HMAC session）、`lib/checkin-core.ts`
- **Server Actions**：`bonus.ts`、`course.ts`、`squad-gathering.ts`、`online-gathering.ts`、`team-gathering.ts`、`testimony.ts`、`team.ts`、`admin.ts`
- **API Routes**：`api/auth/line/route.ts` 與 callback、`api/webhook/line`、`api/cron/*`
- **Client**：`app/page.tsx`（monolith）、`components/Tabs/*.tsx`、`components/Admin/AdminDashboard.tsx`
- **Migrations**：v1 之後新增的 `202604200001-3` 與 `202604210001-2`

---

## Overall Assessment

**APPROVE WITH CONDITIONS** — v1 修掉的 4 項 P1 全部仍有效，本輪發現 **7 項新 P1**（3 個 IDOR + 1 個帳號接管 + 1 個效能崩解路徑 + 1 個索引缺失 + 1 個跨大隊越權）。這些皆屬新 actions / 新流程，不是 v1 的 fix 回退。

### 🟢 2026-04-22 修補狀態更新

**7 項 P1 + 6 項 P2 + 4 項 P3 全部完成**。TypeScript 編譯通過，無新增 lint 錯誤。

| 類別 | 原發現 | 已修 | 未修 | 備註 |
|------|--------|------|------|------|
| P1 | 7 | 7 | 0 | — |
| P2 | 8 | 7 | 1 | 僅 P2-6（Rate limit）保留，需外部服務 |
| P3 | 5 | 4 | 1 | 7/12 freeze 視業務決定是否要 |

**下一步建議**：上線前執行 **3 個新 migration** + 全員重登 + 確認 `SUPABASE_SERVICE_ROLE_KEY` 已設 → 依 7/12 checklist 準備（見文末）。

**上線前**必須完成 P1-A 到 P1-G 的修補（✅ 已完成，預估原 6–8 小時）；P2 系列建議上線後 2 週內補齊。

---

## 📋 修補摘要（2026-04-22 後續）

### 🔴 P1 修補（全部完成）

| # | 位置 | 修補內容 |
|---|------|---------|
| P1-A ✅ | [`app/actions/bonus.ts:260-342`](../app/actions/bonus.ts#L260-L342) | 加 `requireUser()` + 四層權限 scope（admin 不限 / 大隊長限本大隊 / 小隊長限本小隊 / 學員限本人）；學員傳入 `filter.userId` 會被 session uid 覆蓋 |
| P1-B ✅ | [`app/actions/bonus.ts:294-305`](../app/actions/bonus.ts#L294-L305) | 開頭 `if (!(await verifyAdminSession())) return …` |
| P1-C ✅ | [`app/actions/course.ts`](../app/actions/course.ts) + [`Scanner.tsx`](../app/class/checkin/Scanner.tsx) + [`CourseTab.tsx`](../components/Tabs/CourseTab.tsx) | `getCourseAttendanceList` + `markAttendance` 接 `volunteerPassword` 參數；server 端以 `timingSafeEqual` 比對 `SystemSettings.VolunteerPassword`（非 timing-attack vulnerable）；未授權回空陣列 / 錯誤，不洩露 |
| P1-D ✅ | [`lib/auth.ts:100-153`](../lib/auth.ts#L100-L153) + [`api/auth/line/route.ts`](../app/api/auth/line/route.ts) + [`callback`](../app/api/auth/line/callback/route.ts) | 新增 `signPayload/verifyPayload` HMAC 工具（含 10 分鐘 expireTs + nonce）；`/api/auth/line?action=bind` 先 `requireSelf(uid)` 才能拿到 signed state；callback 端驗簽後從 payload 取 uid（不再信任 URL state 字串） |
| P1-E ✅ | [`app/page.tsx:364`](../app/page.tsx#L364) + [`team.ts`](../app/actions/team.ts) 兩處 | 所有 DailyLogs 批次查詢加 30 天窗；`team.ts` 兩個 `.in('UserID', userIds)` 查詢加 `.gte('Timestamp', cutoff)`，走 `idx_dailylogs_userid_timestamp` 複合索引 |
| P1-F ✅ | [`supabase/migrations/202604220001_bonusapps_composite_indexes.sql`](../supabase/migrations/202604220001_bonusapps_composite_indexes.sql) | 新增 4 個複合索引：`(status, created_at)` / `(squad_name, status, created_at)` / `(battalion_name, status, created_at)` / `(user_id, created_at)` |
| P1-G ✅ | [`app/actions/squad-gathering.ts:334-353`](../app/actions/squad-gathering.ts#L334-L353) | 大隊長 QR 掃碼時反查該小隊任一成員的 `CharacterStats.SquadName`（大隊名），驗證與掃碼者 `SquadName` 一致 |

### 🟡 P2 修補（6 項完成 + 1 項誤報 + 2 項保留）

| # | 位置 | 修補內容 |
|---|------|---------|
| P2-1 ✅ | （同 P1-D） | OAuth state HMAC 簽章（action / uid / nonce + 10 分鐘 expireTs） |
| P2-2 ✅ | [`app/page.tsx:636-648`](../app/page.tsx#L636-L648) | 快取 60s → **5 分鐘**；加 `.limit(500)` 防禦上限 |
| P2-3 ✅ | [`bonus.ts` + `CommandantTab.tsx`](../app/actions/bonus.ts) | 新增 `bulkReviewBonusByAdmin(ids[], action, ...)` server action（單次最多 200 筆、樂觀鎖防重複）+ UI 多選 checkbox + 批量駁回/核准按鈕 |
| P2-4 ✅ | [`course.ts:38-48`](../app/actions/course.ts#L38-L48) | `users.length > 1` 時拒絕自動配對，要求聯繫工作人員 |
| P2-5 ✅ | [migration 202604220003](../supabase/migrations/202604220003_rls_tighten_anon_writes.sql) + 3 個新 server action | 封鎖 anon WRITE、保留 anon SELECT；3 處 client 直接寫入遷移到 server action 且加對應 auth |
| P2-6 ⏸ | — | Rate limit 保留；需外部服務（Upstash），上線後觀察再補 |
| P2-7 ✅ | — | `nowTick` 經確認為誤報，無需修 |
| P2-8 ✅ | [`page.tsx:17-28`](../app/page.tsx#L17-L28) | `CaptainTab` / `CommandantTab` / `AdminDashboard` 改用 `next/dynamic`（`ssr: false`） |

### 🟢 P3 修補（4 項完成）

| 項目 | 修補 |
|------|------|
| 死碼 `updateMemberCellText` ✅ | 從 `nine-grid.ts` 完整刪除（原 L128-L186） |
| o7 deadline 1ms 邊界 ✅ | `bonus.ts:L214` 改 `>` → `>=`，消除午夜邊界 1ms 窗口 |
| 臨時加碼「每日 1 次」限制 ✅ | 原本**規格有寫但 server 端完全沒檢查**，僅前端 `isMax` 可繞過。實際上是 P1 級缺失。已新增 [migration 202604220002](../supabase/migrations/202604220002_temp_quest_dedup.sql)，在 `process_checkin` RPC 加 `temp_%` 分支做 dedup（以 DailyLogs 精確 QuestID 比對，含日期字尾） |
| RankTab O(n²) ✅ | [`RankTab.tsx`](../components/Tabs/RankTab.tsx) 新增 `squadsByBattalion` Map 索引，大隊長計入小隊時 O(1) 查表 |

### ⚪ 保留項目

| 項目 | 理由 |
|------|------|
| P2-6 全域 Rate limit | 需外部服務（Upstash / Vercel KV）；既有業務層 dedup 已夠用，上線後若觀察濫用再補 |
| P3 7/12 活動後讀寫 freeze | 規格無明文；視業務決定是否要求 |

---

## 1. v1 修補狀態再檢查

| v1 項目 | 狀態 | 備註 |
|---------|------|------|
| P1 #1 九宮格 cells race condition | ✅ 仍有效 | `process_nine_grid_cell` RPC 搭配 `FOR UPDATE` 正常 |
| P1 #2 wk4 前端驗證 | ✅ 仍有效 | RPC `wk4_small\|% / wk4_large\|%` 分支完整 |
| P1 #3 wk4 RPC 無週內 dedup | ✅ 仍有效 | 同上 RPC 分支 |
| P1 #4 IDOR（server action 信任 client uid） | ✅ 仍有效 | 核心 action 已加 `requireSelf()`；原漏加的 3 個 action（P1-A/B/C）已於 2026-04-22 補齊 |
| P2 #5 wk4 計算缺 useMemo | ✅ 仍有效 | |
| P2 #6 跨午夜顯示漂移 | ✅ 仍有效 | `nowTick` 60s |
| P2 #7 WeekCalendarRow 共用化 | ✅ 仍有效 | |
| P2 #8 updated_at 由 trigger 處理 | ✅ 仍有效 | |
| P2 #9 雙擊同格 ref lock | ✅ 仍有效 | |
| P2 #10 WeeklyTopicTab unused props | ✅ 仍有效 | |

**結論**：v1 修補未回退；本輪問題為新流程上線時的覆蓋缺口。

---

## 2. 新 P1 Findings（上線前必修）

### P1-A ✅ FIXED — `getBonusApplications()` 無身份驗證，洩露全體申請資料

**位置**：[`app/actions/bonus.ts:260-277`](../app/actions/bonus.ts#L260-L277)

**現況**：函式用 `service_role` key 建立 Supabase client，完全未呼叫 `requireSelf()` 或 `verifyAdminSession()`。Filter 接 client 傳入的 `userId` / `squadName` / `status`，無任何檢核。

```typescript
export async function getBonusApplications(filter: {...} = {}) {
    const supabase = createClient(supabaseUrl, supabaseKey);  // service_role
    let query = supabase.from('BonusApplications').select('*')...
    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.squadName) query = query.eq('squad_name', filter.squadName);
    ...
}
```

**影響**：任一已登入使用者可呼叫此 action 讀取**全體**傳愛 / 聯誼會 / 高階課程申請紀錄，包含：
- 申請人姓名、小隊、大隊
- 審核狀態、審核人姓名、備註
- 被介紹人姓名（o7 傳愛）—— **個資洩漏風險**

**修補建議**：
```typescript
const session = await requireUser();  // 拿 session uid
// 學員：強制 filter.userId = session；隊長：強制 filter.squadName = 本隊；大隊長：驗證 battalion
// 或單純：if (filter.userId && filter.userId !== session) throw
```
搭配從 `CharacterStats` 查 session 用戶的 `IsCaptain` / `IsCommandant` / `TeamName` / `BattalionName`，決定可見範圍。

**估時**：1 小時

---

### P1-B ✅ FIXED — `getAdminActivityLog()` 任何人可讀管理日誌

**位置**：[`app/actions/bonus.ts:280-290`](../app/actions/bonus.ts#L280-L290)

**現況**：完全無 auth 檢查；client 可直接呼叫取得 50 筆最新管理操作。

**影響**：洩露審計軌跡（誰核准了誰、什麼時候、原因備註）。若有敏感備註（例如學員個人狀況），屬個資問題。

**修補建議**：函式首行加 `if (!(await verifyAdminSession())) return { success: false, error: '無權限' };`

**估時**：5 分鐘

---

### P1-C ✅ FIXED — `getCourseAttendanceList()` 任何人可讀整班報到名單

**位置**：[`app/actions/course.ts:129-155`](../app/actions/course.ts#L129-L155)

**現況**：整個檔案沒有 import `lib/auth`，也沒任何身份檢查。Client 只要知道 `courseKey`，就能拉出全班的 `userId + userName + attendedAt`。

**影響**：學員出席狀況外洩；userID（含手機末 3 碼）被列舉。

**修補建議**：
1. 先加 `verifyAdminSession()` 或「志工密碼驗證」（目前志工密碼僅存在 SystemSettings 中，需另設 signed cookie 或透過 server action 驗證）
2. 若 CourseTab 用此 API 渲染志工端名單，需重新設計志工身份驗證流程（目前密碼靠前端 localStorage，server 端完全信任）

**估時**：1.5 小時（涉及志工身份驗證重做）

---

### P1-D ✅ FIXED — LINE bind state 可綁架他人帳號

**位置**：[`app/api/auth/line/callback/route.ts:64-91`](../app/api/auth/line/callback/route.ts#L64-L91)

**現況**：
```typescript
if (state.startsWith('bind:')) {
    const uid = state.slice(5);
    ...
    await supabase.from('CharacterStats').update({ LineUserId: lineUserId }).eq('UserID', uid);
}
```

`uid` 直接從 URL state 取，**未驗證發起 bind 的人就是 uid 本人**。搭配 `/api/auth/line?action=bind&uid=...`，攻擊者可誘騙受害者（例如透過社交工程產生 LINE login 連結）把**攻擊者的 LINE** 綁到受害者的遊戲帳號，之後攻擊者用自己的 LINE 登入即可接管帳號。

**影響**：完整帳號接管；配合比賽分數為競賽場域，風險升級。

**修補建議**：
1. 進入 bind 流程前，server 端必須先有 session cookie 證明發起者為 uid 本人
2. 改為 server 端產生一次性 signed state token，內含 `{ uid, csrf, expiresAt }` 的 HMAC；callback 端驗簽才放行
3. 或：bind 時 `await requireSelf(uid)` — 但因 OAuth callback 會開新頁無 cookie 傳遞，需改為 state 內夾 session token

**估時**：2 小時

---

### P1-E ✅ FIXED — DailyLogs 查詢無日期上界，全表掃描風險

**位置**：[`app/page.tsx`](../app/page.tsx) 多處（約 L354 / L364 / L381 / L415） + [`app/actions/team.ts:172-176`](../app/actions/team.ts#L172)

**現況**：DailyLogs 查詢多處只加 `.gte('Timestamp', logsDateCutoff())`，無上界。9 週後 DailyLogs 預估 120K–150K 筆。

**放大情境**：
- 大隊長總部：拉整個大隊 (50+ 人) 的 DailyLogs，無分頁、無日期窗
- 撤銷打卡：讀個人最近日誌來定位 DailyLogs row，每次重拉
- 7/12 畢業典禮當天：同時 200 人打卡 + 大隊長檢視 → Supabase pooler 耗盡

**修補建議**：
1. 全部 DailyLogs 查詢改 `.gte(start).lt(end)` 或配合 `.limit(n)`
2. 大隊長檢視個人明細改為 RPC 預聚合（`SELECT user_id, SUM(...) GROUP BY user_id, date_trunc('week', ...)`）
3. 排行榜不需明細時改查 `CharacterStats.Score`

**估時**：3–4 小時（影響面多）

---

### P1-F ✅ FIXED — BonusApplications 缺複合索引

**位置**：[`supabase/migrations/000000000001_complete_schema.sql:239-241`](../supabase/migrations/000000000001_complete_schema.sql#L239)

**現況**：只建了 3 個單欄索引：`user_id`、`status`、`quest_id`。大隊長終審常用 `(status='squad_approved', squad_name='X', ORDER BY created_at)`，走不到好索引。

**估算**：9 週活動 o1–o7 + 審核流程預計產生 1500–2500 筆 BonusApplications。無索引時，大隊長每次進入「待終審」分頁 = 全表掃描。

**修補建議**：新增 migration
```sql
CREATE INDEX IF NOT EXISTS idx_bonusapps_status_created
  ON public."BonusApplications"(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bonusapps_squad_status_created
  ON public."BonusApplications"(squad_name, status, created_at DESC);
```

**估時**：20 分鐘（含上線 rollout）

---

### P1-G ✅ FIXED — 實體凝聚 QR：大隊長可掃跨大隊 QR

**位置**：[`app/actions/squad-gathering.ts:334-337`](../app/actions/squad-gathering.ts#L334-L337)

**現況**：
```typescript
const isCommandant = !!user.IsCommandant;
if (!isCommandant && user.TeamName !== session.team_name) {
    return { success: false, error: '僅限本小隊成員或大隊長可掃此 QR' };
}
```

只要 `IsCommandant = true` 就放行；**未比對** 大隊長所屬 BattalionName 是否等於該場次所屬大隊。

**影響**：大隊長 A 掃到大隊 B 的 QR → 被記為該小隊的「大隊長出席」→ 觸發 +100 的大隊長加成。若大隊長人數少（規格 1–2 位/大隊），看似不嚴重，但違反業務規則且可被審計質疑。

**修補建議**：
```typescript
// 先從 session 查對應小隊的 BattalionName（JOIN TeamSettings）
if (isCommandant && user.BattalionName !== session.battalion_name) {
    return { success: false, error: '僅能掃本大隊內小隊的 QR' };
}
```

**估時**：30 分鐘（要確認 session 表是否有 battalion_name，沒有的話要先補 schema）

---

## 3. 新 P2 Findings（上線後 2 週內）

### P2-1 ✅ FIXED — OAuth state 無 HMAC 簽名與 CSRF 防護
- **位置**：[`app/api/auth/line/route.ts`](../app/api/auth/line/route.ts)
- **修補**：已隨 P1-D 一併解決。新 state 含 `action / uid / nonce + 10 分鐘 expireTs`，以 HMAC 簽章；callback 端驗簽後從 payload 取 uid

### P2-2 ✅ FIXED — 排行榜無 LIMIT，每 60 秒拉全表
- **位置**：[`app/page.tsx:636-646`](../app/page.tsx#L636-L646)
- **現況**：`CharacterStats` 全量 SELECT，無 limit。200 人 × 10 欄位 ≈ 50KB/request，60 秒 pull 一次
- **修補**（2026-04-22）：快取延長至 **5 分鐘**；查詢加 `.limit(500)` 防禦；高峰期 Supabase pull 頻次降為 1/12

### P2-3 ✅ FIXED — 大隊長批量終審缺失
- **位置**：[`app/actions/bonus.ts` `bulkReviewBonusByAdmin`](../app/actions/bonus.ts) + [`components/Tabs/CommandantTab.tsx`](../components/Tabs/CommandantTab.tsx)
- **影響**：7/1 截止日前夜若積壓 100+ 筆，大隊長要點 100 次
- **修補**（2026-04-22）：
  - 新增 server action `bulkReviewBonusByAdmin(appIds[], action, notes, reviewerName)`，單次最多處理 200 筆
  - UI 加「全選 / 已選 N/M 筆 / 批量駁回 / 批量核准」操作列 + 每筆 checkbox
  - 樂觀鎖（`.eq('status', 'squad_approved')`）避免與單筆審核重複處理

### P2-4 ✅ FIXED — 課程報名「姓名 + 末 3 碼」可撞名
- **位置**：[`app/actions/course.ts:38-48`](../app/actions/course.ts#L38-L48)
- **問題**：`users[0]` 無衝突檢查；兩位同名 + 末 3 碼相同的學員會被錯配
- **修補**（2026-04-22）：`users.length > 1` 時拒絕自動配對，錯誤訊息要求聯繫工作人員以完整手機號驗證

### P2-5 ✅ FIXED — RLS 形同虛設
- **位置**：[`supabase/migrations/202604220003_rls_tighten_anon_writes.sql`](../supabase/migrations/202604220003_rls_tighten_anon_writes.sql)
- **修補策略**（2026-04-22 第三輪）：分層收緊 — **封鎖 anon WRITE、保留 anon SELECT**。不做 `auth.uid() = user_id` 層級的全面 RLS 改造（會需要 Supabase Auth 整合，風險太大）
- **步驟**：
  1. **審計客戶端直接寫入**：僅 3 處（`SystemSettings.upsert` / `temporaryquests` CRUD / `CharacterStats` fortunes UPDATE）
  2. **遷移至 server action**：
     - [`admin.ts` `updateSystemSetting`](../app/actions/admin.ts)（加 `verifyAdminSession`）
     - [`admin.ts` `addTempQuest` / `toggleTempQuest` / `deleteTempQuest`](../app/actions/admin.ts)（加 `verifyAdminSession`）
     - [`nine-grid.ts` `updateUserFortunes`](../app/actions/nine-grid.ts)（加 `requireSelf` + 欄位白名單 + 0-100 值驗證）
  3. **移除 anon INSERT/UPDATE/DELETE policies**（migration 202604220003）：
     - CharacterStats / DailyLogs / TeamSettings / SystemSettings / temporaryquests / BonusApplications / AdminActivityLog / Rosters / CourseRegistrations / CourseAttendance / TopicHistory / MandatoryQuestHistory / SquadGatheringCheckins / NineGridTemplates / UserNineGrid / Testimonies / LineGroups / FinePayments / SquadFineSubmissions
     - 新表（SquadGatheringSessions / SquadGatheringAttendances / OnlineGatheringApplications）啟用 RLS 且無 policy，僅 service_role 可進
  4. **保留 anon SELECT** 於 5 張 client 直讀的表：CharacterStats（排行榜）/ DailyLogs（使用者歷史）/ TeamSettings / SystemSettings / temporaryquests
- **效果**：
  - Anon key 無法再直接 INSERT/UPDATE/DELETE 任何表（例如 `supabase.from('CharacterStats').update({Score: 9999}).eq('UserID', 'victim')` 從 DevTools 發動會被 RLS 擋下）
  - 所有合法寫入路徑維持可用（server actions 以 service_role 執行，自動 bypass RLS）
- **前置條件**：production 必須已設 `SUPABASE_SERVICE_ROLE_KEY`（否則 server action 會 fallback 至 anon key，被自己的 RLS 擋下變成 500）

### P2-6 ⏸ 保留 — 全域無 rate limit
- **影響**：打卡、bonus 申請、QR 掃描、凝聚申請可被迴圈濫用
- **保留理由**：正統做法需外部服務（Upstash / Vercel KV），超出本輪範圍。既有 server action 已有業務層 dedup（打卡 per-day、bonus per-user、凝聚 per-week）；200 人封閉活動濫用風險低
- **建議**：上線後若觀察到實際濫用再補全域限流

### P2-7 ✅ 誤報確認 — `nowTick` 副作用連帶重拉排行榜
- **位置**：[`app/page.tsx:130-136`](../app/page.tsx#L130-L136)
- **結論**（2026-04-22 確認）：全檔審查後，`nowTick` 僅經 `useMemo` 產生 `logicalTodayStr` / `currentWeeklyMonday`。排行榜 useEffect 的 deps 為 `[activeTab, view]`（不含 tick）；其他 useEffect 也無引用這兩 memo 值觸發 DB 查詢。原代理審查為誤報，保留現狀

### P2-8 ✅ FIXED — `app/page.tsx` monolith（955 行、28 imports）
- **影響**：首屏重、編輯時回歸風險大
- **修補**（2026-04-22）：`CaptainTab` / `CommandantTab` / `AdminDashboard` 三個管理者專用重型元件改為 `next/dynamic`（`ssr: false`）。學員首屏不再打包這三個元件，bundle 預估降 20-30%

---

## 4. P3 Findings（代碼衛生）

- ✅ **死碼 `updateMemberCellText`**：[`app/actions/nine-grid.ts`](../app/actions/nine-grid.ts) 已於 2026-04-22 刪除
- ✅ **o7 deadline 邊界**：[`app/actions/bonus.ts:214`](../app/actions/bonus.ts#L214) 已改 `>=`，1ms 窗口消除
- ✅ **RankTab squadRank O(n²)**：[`components/Tabs/RankTab.tsx`](../components/Tabs/RankTab.tsx) 已於 2026-04-22 優化 — 改用 `squadsByBattalion: Map<battalion, SquadRankEntry[]>` 索引，大隊長計入本大隊小隊時從 `[...map.values()].filter(...)` 改為 O(1) 查表
- ✅ **臨時加碼任務「每日最多 1 次」實作位置**：追蹤後發現 **server 端完全未檢查**（原 RPC 走到「其他任務無限制」分支），實際上應為 P1 級缺失。已於 2026-04-22 以 [migration 202604220002](../supabase/migrations/202604220002_temp_quest_dedup.sql) 在 `process_checkin` RPC 加 `temp_%` 分支，用 DailyLogs 精確 QuestID 比對（questId 已內含日期字尾 `|YYYY-MM-DD`）
- ⚪ **活動結束（7/12 後）無讀寫 freeze**：規格無明文，視業務決定；若需凍結，於 `process_checkin` RPC 入口加 `IF now() > '2026-07-12 23:59:59+08' THEN RETURN error END IF;`

---

## 5. 效能分析

### 5.1 資料量估算（9 週後）

| 表 | 預估筆數 | 增長速率 | 關鍵查詢 | 索引狀態 |
|----|---------|---------|---------|---------|
| DailyLogs | 120K–150K | 13K–17K/週 | by UserID + Timestamp、by QuestID | ✅ `idx_dailylogs_userid_timestamp`（v1 加）|
| BonusApplications | 1.5K–2.5K | 150–250/週 | by status + squad_name | ⚠️ 缺複合索引（P1-F）|
| CharacterStats | 200 | 0 | 全表 order by Score | ✅ Score 小表無壓力 |
| UserNineGrid | 200 | 0 | by member_id | ✅ |
| SquadGatheringSessions | 400–500 | 60/週 | by team_name + gathering_date | ⚠️ unique constraint 狀態待查 |
| OnlineGatheringApplications | 1.5K–2K | 200/週 | by user_id + week_monday | ✅ `uq_oga_user_week_active` |
| AdminActivityLog | 5K–10K | 600–1000/週 | by created_at DESC LIMIT | ✅ 順序追加即可 |

### 5.2 熱點時段與並發

| 時段 | 估計並發 | 瓶頸 |
|------|---------|------|
| 每週一 00:00 | 50–100 人同時打卡 | `process_checkin` 單 row `FOR UPDATE` + wk 系列 dedup scan |
| 破曉 05:00–08:00 | 100+ 人（密度分散） | p1 + p1_dawn 組合查詢 |
| 睡前 22:00–23:59 | 150+ 人 | 定課上限驗證 + 飲控 dedup |
| **7/12 18:00–23:59 畢業典禮** | **200 人同時** | **最大衝擊**：打卡 + 直播排行榜（60s 全表）+ 大隊長終審高峰 |

### 5.3 Supabase 連線池風險

免費 / Pro plan pooler 預設 15–60 connections。7/12 若 200 人同時：
- 打卡 RPC 約 0.5–1 秒/request
- 排行榜 60s polling
- 大隊長終審批量

**建議**：
- 活動前一週檢查 Supabase 方案，若仍在 Free，建議升 Pro（200 conn）
- 監控 `Compute usage` Dashboard

---

## 6. 9 週期程風險時間軸

```
2026-05-09 (六)   系統上線             → 全員重登（cookie 不相容）
2026-05-10 (日)   活動開跑             → 首波打卡峰值
每週一 00:00     週界重置              → wk 系列 dedup 壓力
每日 05-08       破曉打拳              → p1 + p1_dawn 熱點
每日 22-24       睡前衝刺              → 定課上限驗證
2026-07-01 (三)  一次性任務截止        → 審核積壓（o1, o2_*, o3-o6）
2026-07-11 (六)  傳愛 o7 截止          → 二次審核高峰
2026-07-12 (日)  畢業典禮（活動結束） → ★ 最大衝擊 ★
```

**7/12 必做**：
1. 提前升 Supabase pool（或 pause 非必要 cron）
2. 考慮提前 disable 部分 UI 操作（撤銷打卡）
3. 排行榜改 5 分鐘快取（直播場景不需秒級更新）

---

## 7. 建議修補順序

### ✅ 上線前（P1 + 可執行 P3）— 已全部完成 2026-04-22

| # | 項目 | 狀態 |
|---|------|------|
| 1 | P1-A `getBonusApplications` 加 auth | ✅ |
| 2 | P1-B `getAdminActivityLog` 加 auth | ✅ |
| 3 | P1-C `getCourseAttendanceList` 加 auth（含志工密碼 timing-safe 比對） | ✅ |
| 4 | P1-D LINE bind state HMAC 簽章 | ✅（同時解掉 P2-1 的 OAuth state CSRF） |
| 5 | P1-F BonusApplications 複合索引 migration | ✅ |
| 6 | P1-G QR 掃碼檢查 battalion | ✅（用反查小隊成員的 `SquadName` 取代補 schema） |
| 7 | P1-E DailyLogs 日期上界 | ✅ |
| 8 | P3 死碼 + o7 1ms + 臨時加碼 server dedup | ✅ |

**TypeScript 編譯通過、無新增 lint 錯誤。**

### 🟡 上線後 2 週（5/24 之前）— ✅ 多數已於 2026-04-22 完成

- ✅ P2-2 排行榜 LIMIT + 5 分鐘快取
- ✅ P2-3 大隊長批量終審 API + UI
- ✅ P2-4 課程報名撞名防護
- ✅ P2-5 RLS 收緊 anon 寫入（原估活動後做，已提前於 2026-04-22 完成）
- ⏸ P2-6 Rate limiting middleware — 保留（需 Upstash，建議上線後觀察再補）
- ✅ P2-7 nowTick — 經確認為誤報
- ✅ P2-8 page.tsx dynamic import
- ~~P2-1~~ OAuth state 無簽名 — 已隨 P1-D 修掉

### 🟢 活動期間 / 後續

- ⏸ P2-6 全域 Rate limit — 觀察後再補
- 若需更嚴格的 `auth.uid() = user_id` RLS（目前僅封鎖 anon 寫入，未做 row-level 擁有者驗證），活動結束後再評估

### 🔵 7/12 畢業典禮前額外 checklist

- [ ] Supabase 連線池確認 ≥ 100
- [ ] 排行榜快取加長至 5 分鐘
- [ ] 考慮提前 24 小時關閉撤銷打卡
- [ ] 大隊長、小隊長提前 2 天清空待審清單
- [ ] 準備 rollback 策略（若有 RPC 新問題）

---

## 🚀 建議下一步行動

### A. 立即（上線前；本週完成）

**A-1. Production 執行新 migrations（3 個，按時間戳順序）**
```bash
# 202604220001_bonusapps_composite_indexes.sql  （複合索引）
# 202604220002_temp_quest_dedup.sql              （RPC temp_% dedup）
# 202604220003_rls_tighten_anon_writes.sql       （封鎖 anon 寫入）
```
- **前置**：確認 production env 已設 `SUPABASE_SERVICE_ROLE_KEY`（否則 server action 會被自己的 RLS 擋下變 500）
- 驗證：Supabase Dashboard → Database → Indexes 確認 4 個新索引出現
- 驗證：同一 temp quest 當日打第二次 → `{success: false, error: '此臨時任務今日已完成。'}`
- 驗證：以 anon key 直接 `POST /rest/v1/CharacterStats` 或 `PATCH` → 應回 401/403
- 驗證：正常打卡、審核、凝聚、課程報到流程全部運作（所有 server action 要能 bypass RLS）

**A-2. 環境變數與 Cookie 遷移**
- 確認 production 已設 `AUTH_SESSION_SECRET`（32+ byte random）
- 新 HMAC state 不相容舊格式 → 全員 LINE 重登公告（預留 24 小時 grace period）
- 確認 `SystemSettings.VolunteerPassword` 已在管理後台設定（P1-C 需要）

**A-3. 回歸驗證（重點 5 項）**
| 功能 | 測試 |
|------|------|
| LINE bind | 用 A 帳號登入，拿 A 的 bind 連結；用 B 帳號開另一瀏覽器貼 A 的連結 → 應被 `line_error=bind_unauthorized` 拒絕 |
| Bonus 申請可見性 | 學員 C 呼叫 `getBonusApplications({userId: D})` → 應只回 C 自己的資料 |
| 跨大隊 QR | 大隊長 E（大隊 X）掃大隊 Y 的小隊 QR → 應回「僅能掃本大隊所轄小隊的 QR」 |
| 臨時加碼繞過 | 用 DevTools 對同一 `temp_XXX\|日期` 連續送兩次 RPC → 第二次應被 RPC 拒 |
| 課程報到 | 未輸入志工密碼的 client 呼叫 `getCourseAttendanceList` → 回空陣列 |

### B. 上線後 2 週內（P2 系列）

| 優先 | 項目 | 建議工時 |
|------|------|---------|
| 高 | **P2-3 大隊長批量終審 API** — 7/1 截止前夜若積壓 100 筆，不批量會卡死 | 3h |
| 高 | **P2-2 排行榜 LIMIT + 5 分鐘快取** — 直接減少 60 秒 polling 的 Supabase 負載 | 2h |
| 中 | **P2-4 課程報名撞名防護** — 改為 `users.length !== 1` 即拒 | 30m |
| 中 | **P2-6 Rate limit**（打卡、bonus、QR）— 以 Upstash Redis 在 middleware 實作 | 4h |
| 低 | P2-7 nowTick 副作用拆分 | 1h |

### C. 7/12 畢業典禮前（活動結束前 1 週）

- [ ] Supabase 方案檢查：若仍在 Free Plan（15 conn），升級 Pro（200 conn）以應付 200 人同時在線
- [ ] 直播前 24 小時關閉撤銷打卡功能（避免審計壓力）
- [ ] 大隊長、小隊長提前 2 天清空審核積壓
- [ ] Cron `auto-draw` / `weekly-snapshot` 確認 7/13 已停用或最後一輪執行完畢

### D. 後續（活動結束後）

- P2-5 RLS 收緊（改用 `auth.uid() = user_id` 配合 Supabase Auth 或自建 JWT）
- P2-8 `app/page.tsx` dynamic import 拆分（降首屏 30%）
- 設計 7/12 後活動 freeze 機制（若業務需要）

---

## 8. 未覆蓋範圍

- **未測**：Supabase production rollback 策略（migration 如何回溯）
- **未測**：iOS Safari / Android LINE in-app browser 跨裝置 QR 掃碼流程
- **未測**：200 人真實負載（目前僅推估）
- **未檢**：LINE webhook `app/api/webhook/line` 是否有 quest 相關捷徑
- **未檢**：`cron/auto-draw` / `cron/weekly-snapshot` 的錯誤恢復策略
- **未檢**：大隊長分數計入「每一個小隊」的實作細節（相信代碼 agent 審過，未親測邊界）

---

## 9. Summary

- ✅ **v1 fix 全部仍有效**
- ✅ **7 項 P1 全部修補**（2026-04-22）
- ✅ **7 項 P2 修補 + 1 項誤報確認**（2026-04-22）；剩 1 項 P2 保留：
  - **P2-6 Rate limit**：需外部服務（Upstash / Vercel KV），上線後觀察再補
- ✅ **P2-5 RLS 收緊**：已封鎖 anon WRITE 於全部表；3 處 client 直接寫入遷移到 server action；保留 anon SELECT 於 5 張 client 直讀表
- ✅ **4 項可執行 P3 修補完成**（含原認為 P3 但實為 P1 的臨時加碼 dedup、及 RankTab O(n²) 優化）
- ⚪ **1 項 P3 視業務決定**：活動結束後讀寫 freeze
- 🔵 **7/12 畢業典禮** checklist 待執行

**立即下一步**：按「🚀 建議下一步行動 → A. 立即」執行 — 部署 2 個新 migration、設定 `AUTH_SESSION_SECRET`、公告全員重登、做回歸驗證。驗證通過即可上線（5/9）。
