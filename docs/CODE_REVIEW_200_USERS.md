> ⚠️ **已整合至 [CODE_REVIEW_CONSOLIDATED.md](./CODE_REVIEW_CONSOLIDATED.md)**（保留作 V1 歷史紀錄）。最新待辦項目請見彙整文件。

# Code Review — 人生大戲分享移位 + 計分重構（200 人環境壓力檢測）

**Review 日期**：2026-04-20
**Diff 範圍**：`app/actions/nine-grid.ts`, `app/page.tsx`, `components/NineGridCard.tsx`, `components/Tabs/NineGridTab.tsx`, `components/Tabs/WeeklyTopicTab.tsx`
**關聯核心路徑**：`app/actions/quest.ts`, `supabase/migrations/202604160001_new_quest_system.sql`, `202604190002_nine_grid_checkin_dedup.sql`, `202604190001_perf_and_security.sql`, `app/api/auth/session/route.ts`

**威脅模型**：混合等級（學員為主，但分數涉及競賽 / 舉報風氣，可繞過計分的漏洞視為 P1 以上）

**Overall Assessment**：**APPROVE**（4 項 P1 + 6 項 P2 皆已於 2026-04-20 / 2026-04-21 修補，見下表）

### P1 狀態總表

| 項目 | 狀態 | 備註 |
|------|------|------|
| P1 #1 race condition（cells JSONB） | ✅ FIXED | migration `202604200002_nine_grid_cell_atomic.sql` + `app/actions/nine-grid.ts:completeCell` 改走 RPC |
| P1 #2 wk4「當週 ≥1 格」僅前端驗證 | ✅ FIXED | migration `202604200001_wk4_server_enforcement.sql` |
| P1 #3 wk4 RPC 無週內 dedup | ✅ FIXED | 同上 migration |
| P1 #4 IDOR（server action 信任 client userId） | ✅ FIXED | `lib/auth.ts` HMAC session cookie + `requireSelf()` 導入所有 user-facing server actions |

### P2 狀態總表

| 項目 | 狀態 | 備註 |
|------|------|------|
| P2 #5 wk4 計算缺 `useMemo` | ✅ FIXED | `NineGridTab.tsx` 以 `useMemo` 包裝，deps `[grid, logs, currentWeeklyMonday, questRewardOverrides, disabledQuests]` |
| P2 #6 `WeekCalendarRow` 跨午夜顯示漂移 | ✅ FIXED | `page.tsx` 加 `nowTick` `setInterval(60s)`，`currentWeeklyMonday` / `logicalTodayStr` 依 `nowTick` 重算 |
| P2 #7 `WeekCalendarRow` 重複實作 | ✅ FIXED | 抽到共用 `components/WeekCalendarRow.tsx`，兩 Tab 共用 |
| P2 #8 `updated_at` 由應用層寫入 | ✅ FIXED | migration `202604200003_nine_grid_updated_at_trigger.sql` BEFORE UPDATE trigger + app 端移除 `updated_at` 寫入 |
| P2 #9 雙擊同格可能發兩次 request | ✅ FIXED | `NineGridCard.tsx` 加 `completingRef` ref-based lock |
| P2 #10 WeeklyTopicTab 遺留 unused props | ✅ FIXED | 刪除 `userId, systemSettings, logicalTodayStr, isTopicDone, isCaptain, teamName, squadMemberCount` 等未使用 props |

---

## Findings

### P0 — Critical
（無新增）

### P1 — High

#### 1. ✅ FIXED（`202604200002_nine_grid_cell_atomic.sql`） **[app/actions/nine-grid.ts:114–138]** `completeCell` cells JSONB 讀改寫存在競得漏洞（race condition，new business rule 放大影響）
- **問題**：`SELECT cells → 修改 → UPDATE` 非原子操作。同一使用者快速雙擊兩格（網路延遲 100ms 內），可能發生：
  ```
  Req A  SELECT cells (all unchecked)
  Req B  SELECT cells (all unchecked)        ← 讀到 A 寫入前的快照
  Req A  UPDATE cells[0,3,6 completed]       ← 剛好連線，發 +300
  Req B  UPDATE cells[0,3,2 completed]       ← 覆蓋 A，cell 6 被還原
  結果：DailyLogs 有 nine_grid_line|cell6 +300，但實際沒有 6-cell 連線
  ```
- **放大背景**：本次把**連線分改成唯一得分點**（格子本身不給分）。race 造成的「幽靈連線分」過去只是數學上的巧合，現在變成**玩家唯一能刷分的方式**，激勵更大。
- **目前緩解**：migration `202604190002_nine_grid_checkin_dedup.sql` 只為 `nine_grid_cell|%` 做 DailyLogs 層 dedup，**沒有保護 `nine_grid_line|cell%`**。同一格索引的連線 questId 可被重複入帳（A、B 都可能發出 `nine_grid_line|cell0`）。
- **建議修補（擇一）**：
  1. **SQL 層**：在 `completeCell` 把整段包進 RPC，開頭 `SELECT ... FOR UPDATE` 鎖定 `UserNineGrid` 該 row。
  2. **應用層快速修補**：將 `nine_grid_line|cell${cellIndex}` 改為與該格配對的唯一鍵（例如 `nine_grid_line|${userId}|${cellIndex}`），再搭配 `DailyLogs` dedup migration 擴展到 `nine_grid_line|%`。（但無法阻擋 cells JSONB 被覆蓋的問題，僅防重複入帳。）
  3. **推薦**：採用 `UserNineGrid` row-level lock，並把「標記 cell + 計算新連線 + 發獎」放在單一 SQL transaction（與 `process_checkin` 合併或新增 `process_nine_grid_cell` RPC）。
- **修補摘要（2026-04-20）**：`supabase/migrations/202604200002_nine_grid_cell_atomic.sql` 新增 `process_nine_grid_cell(p_user_id, p_cell_index)` RPC：
  1. `SELECT * FROM "UserNineGrid" ... FOR UPDATE` 鎖定該 user 的 grid row，序列化同 user 的並發 cell 打卡
  2. 以 `DailyLogs` 的 `nine_grid_cell|N` 做二次 dedup（對齊 `202604190002` 已建立的保護）
  3. 於 PL/pgSQL 內以 `FOREACH v_line SLICE 1 IN ARRAY v_lines` 計算「舊連線數 / 新連線數」，同一 transaction 以 `jsonb_set` 更新 cells、INSERT `nine_grid_cell|N` 稽核 log、若有新連線再 UPDATE `CharacterStats."Score"` + INSERT `nine_grid_line|cellN` 連線 log
  4. 鎖順序：UserNineGrid → CharacterStats；`process_checkin` 只鎖 CharacterStats 不鎖 UserNineGrid，故兩條 RPC 不會 deadlock
- **App 端配合改動**：`app/actions/nine-grid.ts:completeCell` 改為單純呼叫 `supabase.rpc('process_nine_grid_cell', ...)`，移除原本 SELECT → JS mutate → UPDATE 的三步流程。

#### 2. ✅ FIXED（`202604200001_wk4_server_enforcement.sql`） **[app/actions/quest.ts:25–31 + NineGridTab.tsx:127–224]** wk4 分享「同週 ≥1 格」條件僅前端驗證，server 可被直接繞過
- **問題**：新業務規則「當週完成 ≥1 格才能打 wk4_small/wk4_large」只寫在 `NineGridTab.tsx` 的 `hasCompletedCellThisWeek` 計算上。任何使用者只要繞過 UI（DevTools 直接呼叫 `processCheckInTransaction('wk4_small|2026-04-20', ...)`）就能取得 +200/+300，不需完成任何格子。
- **影響**：刷分最低成本路徑；200 人環境中只要一個人會按 F12 就會擴散。
- **建議修補**：在 `process_checkin` RPC 新增 `wk4_small|`/`wk4_large|` 分支，查 `UserNineGrid` 是否有當週完成紀錄：
  ```sql
  ELSIF p_quest_id LIKE 'wk4_small|%' OR p_quest_id LIKE 'wk4_large|%' THEN
    -- 當週週一
    v_monday := date_trunc('week', (p_logical_today::date))::timestamp;
    SELECT COUNT(*) INTO v_dup_count FROM "UserNineGrid",
         jsonb_array_elements(cells) AS cell
    WHERE member_id = p_user_id
      AND (cell->>'completed')::boolean = true
      AND (cell->>'completed_at')::timestamptz >= v_monday;
    IF v_dup_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '當週尚未完成任何九宮格格子。');
    END IF;
    -- 同時檢查本週 wk4 dedup（見 #3）
  END IF;
  ```
- **修補摘要（2026-04-20）**：`supabase/migrations/202604200001_wk4_server_enforcement.sql` 於 `process_checkin` RPC 新增 `wk4_small|%` / `wk4_large|%` 分支。RPC 入口已有 `SELECT * FROM "CharacterStats" ... FOR UPDATE` 序列化同 user 並發請求；wk4 分支以 `UserNineGrid.cells` JSONB scan（`jsonb_array_elements` + `completed_at >= v_monday`）驗證當週至少完成 1 格，不通過直接回 `{success:false}`。週界 `v_monday` 以 `date_trunc('week', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'` 計算，確保 Monday 00:00 Asia/Taipei 與 UTC 儲存時間正確比對。

#### 3. ✅ FIXED（`202604200001_wk4_server_enforcement.sql`） **[supabase/migrations/202604160001:146 + NineGridTab.tsx:135]** wk4_small/wk4_large 在 RPC 層沒有週內 dedup，UI 限制可被繞過
- **問題**：`process_checkin` 對 wk4 quests 只走「無每日上限」路徑——RPC 最後一段註解 `-- 其他任務...無重複限制`。
- wk4 的 questId 長成 `wk4_small|2026-04-20`，每天都是一個「全新」questId。使用者可於週一打 `wk4_small|2026-04-20`、週二打 `wk4_small|2026-04-21`……整週可刷 7 次 +200 = +1400（上限應該是 +200）。
- **影響**：同 #2，直接刷分。200 人若有任何 1 位發現，整個排行榜意義歸零。
- **建議修補**：延伸 #2 的 RPC 分支，新增 wk4 本週 dedup：
  ```sql
  -- 當週同類型 wk4 只能入帳一次
  SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
  WHERE "UserID" = p_user_id
    AND (
      "QuestID" LIKE split_part(p_quest_id, '|', 1) || '|%'
    )
    AND "Timestamp" >= v_monday;
  IF v_cap_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '本週此分享已記錄。');
  END IF;
  ```
- **修補摘要（2026-04-20）**：同 `202604200001_wk4_server_enforcement.sql`。於上述 `wk4_small|% / wk4_large|%` 分支以 `v_quest_prefix := split_part(p_quest_id, '|', 1)` 取出 `wk4_small` / `wk4_large` 前綴，再以 `DailyLogs."QuestID" LIKE v_quest_prefix || '|%' AND "Timestamp" >= v_monday` 比對本週是否已有入帳紀錄，有則回 `{success:false, error:'本週此分享已記錄。'}`。RPC 入口的 `SELECT FOR UPDATE` 同時序列化同 user 的並發請求，避免 check-and-insert race。

#### 4. ✅ FIXED（`lib/auth.ts` + `requireSelf()` 導入） **[app/actions/nine-grid.ts:114 + app/actions/quest.ts:16]** IDOR：server action 接收 client 傳入的 userId，未與 session 核對
- **問題**：`completeCell(userId, userName, cellIndex)` 及 `processCheckInTransaction(userId, ...)` 都直接信任 client 傳入的 `userId`。Server 端完全沒有從 cookie / session 驗證「呼叫者就是 userId 的本人」。
- 現行驗證機制僅在 `/api/auth/session` 交換 cookie 給 client，之後 client 自行在每次 action 中帶入 userId。攻擊者只要拿到任何 userId 字串（例：從 leaderboard API 取得），就能把分數加在他人帳號，或替他人把不想做的打卡清除。
- **放大背景**：雖是既有架構缺陷（本次 diff 並未新增新的 IDOR 點），但本次新增的 wk4 → NineGridTab 流程繼續沿用此模式。**在混合威脅模型下**此項應在上線前修掉。
- **建議修補**：
  1. 於 `app/actions/*.ts` 新增 helper：
     ```ts
     async function requireUser() {
       const c = await cookies();
       const uid = c.get('line_session_uid')?.value;
       if (!uid) throw new Error('UNAUTHENTICATED');
       return uid;
     }
     ```
  2. 所有 server action 開頭呼叫 `const sessionUid = await requireUser(); if (sessionUid !== userId) return {success:false, error:'UNAUTHORIZED'};`（或直接忽略 client 傳入，全部用 sessionUid）。
  3. 注意 `session` cookie 現為 single-use 交換後清除，需改為長效 session cookie（`SameSite=Lax; HttpOnly; Secure`；maxAge 配合活動期限）。
- **修補摘要（2026-04-20）**：
  1. `lib/auth.ts` 新增 HMAC-signed 長效 session cookie（cookie 名沿用 `line_session_uid`，TTL 120 天，`HttpOnly; Secure; SameSite=Lax`；Token 格式 `${userId}.${hmac(userId, AUTH_SESSION_SECRET)}`）。匯出 `requireUser()` / `requireSelf(expectedUserId)` / `setSessionCookie()` / `clearSessionCookie()` / `authErrorResponse()`。
  2. `/api/auth/session` 改為純讀 session；LINE OAuth callback 以 `signUserId(userId)` 簽 cookie；新增 server action `app/actions/auth.ts:loginWithPhone` / `registerAccount` / `logoutUser` 取代 `app/page.tsx` 內直接讀 Supabase 的登入路徑，統一由 server 設定 signed cookie。
  3. 所有 user-facing server actions（`quest.ts`、`nine-grid.ts`、`team.ts`、`bonus.ts`、`squad-gathering.ts`）開頭呼叫 `requireSelf(userId)`；審核流程（`bonus.ts` 大隊長終審、`admin.ts` 成員管理）改呼叫 `verifyAdminSession()`；審核者代他人入帳的邏輯拆出 `lib/checkin-core.ts:processCheckInCore`（非 `'use server'`，client 無法直接觸發），由 `processCheckInTransaction` 先做 `requireSelf` 再 delegate。
  4. 上線配套：須先於環境變數新增 `AUTH_SESSION_SECRET`（32+ byte random），且既有使用者 cookie 不相容，**需全員重登**（由 LINE Rich Menu 公告先行通知）。

---

### P2 — Medium

#### 5. ✅ FIXED（`components/Tabs/NineGridTab.tsx`） **[components/Tabs/NineGridTab.tsx:131–148]** wk4 相關計算缺少 `useMemo`，每 render 重算
- **問題**：每次 render 都跑：
  - `grid.cells.some(...)` × 1
  - `WEEKLY_QUEST_CONFIG.filter(...).map(...)` × 1
  - `logs.filter(...)` × 2（`countThisWeek` 呼叫兩次）
  - `new Date(completed_at)` × 9（最壞情況）
  - `new Date(Timestamp)` × logs.length
- 在 200 人環境下 logs 可能每人累積 300–600 筆（60 天活動），重 render 時的 CPU 成本不高但會放大互動延遲。
- **建議**：將 `hasCompletedCellThisWeek`、`wk4SmallCount`、`wk4LargeCount`、`allWk4` 包 `useMemo`，依賴 `[grid, logs, currentWeeklyMonday, questRewardOverrides, disabledQuests]`。
- **修補摘要（2026-04-21）**：`NineGridTab.tsx` 將 `hasCompletedCellThisWeek` / `wk4SmallQuest` / `wk4LargeQuest` / `wk4SmallCount` / `wk4LargeCount` 以單一 `useMemo` 聚合，依賴 `[grid, logs, currentWeeklyMonday, questRewardOverrides, disabledQuests]`；`WeeklyTopicTab.tsx` 同步將週內任務列表與 count 包進 `useMemo`。

#### 6. ✅ FIXED（`app/page.tsx` + `components/WeekCalendarRow.tsx`） **[components/Tabs/NineGridTab.tsx:53–59 + WeeklyTopicTab.tsx:47–50]** `WeekCalendarRow` 在渲染時用 `new Date()`（非 prop 傳入），跨午夜時客戶端顯示錯亂
- **問題**：當使用者在 23:59 開啟分頁、00:00 之後按打卡，顯示的「本週」仍以開啟瞬間的 `new Date()` 計算，但 `currentWeeklyMonday` 是父層 `useMemo` 空依賴的同個問題。跨週或跨天時出現：
  - 週日晚上開著分頁 → 週一早上打卡：UI 顯示的日期仍是上週日期區段
  - 活動結束當週特別關鍵（7/12 結束）
- **建議**：改讓父層傳入 `now` 或用 `useEffect` + `setInterval(60 * 1000)` 每分鐘強制 re-compute；或至少讓 `currentWeeklyMonday` 不固定依賴。
- **修補摘要（2026-04-21）**：`app/page.tsx` 新增 `nowTick` state（`setInterval(60s)`），`currentWeeklyMonday` / `logicalTodayStr` 改為 `useMemo(() => ..., [nowTick])`，每分鐘 re-compute。共用 `components/WeekCalendarRow.tsx` 以 prop `currentWeeklyMonday` 接收父層計算結果，不在元件內呼叫 `new Date()`，跨午夜後下一分鐘即自動刷新 UI。

#### 7. ✅ FIXED（`components/WeekCalendarRow.tsx`） **[components/Tabs/NineGridTab.tsx + WeeklyTopicTab.tsx]** `WeekCalendarRow` 重複實作兩次
- **問題**：同邏輯兩份，未來要改（例如加顯示小圖示、加限制）容易遺漏其中一邊。
- **建議**：抽到 `components/WeekCalendarRow.tsx`，兩邊 import；或建 hook `useWeekCalendar(questId, logs, handlers)`。
- **修補摘要（2026-04-21）**：新增共用元件 `components/WeekCalendarRow.tsx`，接收 `{ questId, logs, disabled, currentWeeklyMonday, onCheckIn, onUndo }` props；`NineGridTab.tsx` / `WeeklyTopicTab.tsx` 刪除各自的 local 實作改為 import 共用版本。

#### 8. ✅ FIXED（`supabase/migrations/202604200003_nine_grid_updated_at_trigger.sql`） **[app/actions/nine-grid.ts:131]** `updated_at` 由應用層寫入（`new Date().toISOString()`），與 DB `NOW()` 可能不同步
- **問題**：若未來對帳（分數 vs 打卡時間）依賴 updated_at 排序，client clock skew 會造成順序錯位。
- **建議**：讓 Supabase trigger 或 `default now()` 處理，應用層不寫 updated_at。
- **修補摘要（2026-04-21）**：新增 migration `202604200003_nine_grid_updated_at_trigger.sql`，建立共用 `set_updated_at_now()` function 與 `BEFORE UPDATE` trigger 套用到 `UserNineGrid` / `NineGridTemplates`，由 DB 以 `NOW()` 強制寫入 `updated_at`。`app/actions/nine-grid.ts` 三處（`updateTemplate` / `initMemberGrid` / `updateMemberCellText`）移除應用層 `updated_at: new Date().toISOString()`。

#### 9. ✅ FIXED（`components/NineGridCard.tsx`） **[NineGridCard.tsx:60]** 使用者雙擊同一格，前端 `completing` 狀態雖有 lock，但 button disabled 生效前仍可能觸發兩次 request
- **問題**：`setCompleting(idx)` 是 async state update，極快的連點可在狀態更新前觸發兩次。
- **緩解**：server 端已有 `nine_grid_cell|N` dedup（migration 202604190002）擋掉重複入帳；**但 UserNineGrid cells 的競寫問題仍在**（見 #1）。
- **建議**：`handleComplete` 第一行用 ref-based lock 或 disable 整個 grid container：
  ```ts
  if (completingRef.current !== null) return;
  completingRef.current = idx;
  ```
- **修補摘要（2026-04-21）**：`NineGridCard.tsx` 新增 `const completingRef = React.useRef<number | null>(null);`，`handleComplete` 第一行 `if (completingRef.current !== null) return;` 於 `setCompleting` 之前同步設定 ref，RPC 呼叫用 try/finally 同時 reset ref 與 state。即使雙擊在 React state commit 之前觸發，第二次也會被 ref 擋掉，不會送出重複 RPC。

#### 10. ✅ FIXED（`components/Tabs/WeeklyTopicTab.tsx` + `app/page.tsx`） **[components/Tabs/WeeklyTopicTab.tsx:76–88]** 保留多個已 unused props（lint warning 中的 `userId`, `systemSettings`, `logicalTodayStr`, `isTopicDone`, `isCaptain` 等）
- **問題**：此檔既有的 lint warnings，本次未處理；移除 wk4 後 `Mic` / `Award` 等 icon import 已清掉，但其他 unused props 仍在。
- **建議**：小幅清理，或在 `eslint.config` 加 `argsIgnorePattern: '^_'` 並對保留 props 加底線。
- **修補摘要（2026-04-21）**：`WeeklyTopicTab` 的 props interface 刪除 `userId` / `systemSettings` / `logicalTodayStr` / `isTopicDone` / `isCaptain` / `teamName` / `squadMemberCount`；`app/page.tsx` 的 `<WeeklyTopicTab>` 呼叫端同步刪除這些 props。剩餘 props 精簡至 `logs, currentWeeklyMonday, temporaryQuests, onCheckIn, onUndo, questRewardOverrides, disabledQuests`。

### P3 — Low

#### 11. **[components/Tabs/NineGridTab.tsx:159, 165]** `makeWeekHandler` 的 `_qid` 參數未使用
- **建議**：既然簽名已強制 `(qId, day) =>`，可把未使用參數改名 `_qid`（目前已是，無需再改）；長期應簡化 `WeekCalendarRow` 的 callback 簽名，去掉 `qId` 參數（因為 questId 已 closure capture）。

#### 12. **[app/actions/nine-grid.ts:114]** `userName` 參數傳入但未用
- **問題**：已刪掉 per-cell 計分後，這個參數在 `completeCell` 裡只有連線獎勵用得到（`nine_grid_line` 加分的 title 都寫死），`userName` 實際未使用。
- **建議**：移除 `userName` 參數；或若需要記錄 `completed_at` 旁的 `completed_by_name` 可保留（但目前 schema 沒此欄位）。

#### 13. **[docs/GAME_DESIGN.md]** §1.2 說明「每格得分相同」與 §3 移除格子分的描述可能兩處不一致
- **建議**：統一用一段說明格子分為 0，連線才給分。

---

## 效能分析（200 人同時在線）

### 壓力熱點

| 熱點 | 風險評估 | 註 |
|------|---------|-----|
| `process_checkin` RPC | **低**。每次只鎖單一 CharacterStats row（`FOR UPDATE`），3 次 COUNT 走新建的複合索引 `idx_dailylogs_userid_timestamp` | 已在 `202604190001` migration 優化 |
| Monday 00:00 重置週 | **中**。若使用者守在分頁打卡，瞬間 200 人同時 POST。Vercel Fluid Compute 可擴到同一 function instance，但 Supabase pooler 仍是瓶頸 | 建議監控 Supabase Dashboard `Compute usage`，並於活動前確認 pooler 連線上限 ≥ 50 |
| `completeCell` JSONB 讀改寫 | **高**（見 P1 #1） | 單使用者快速點擊即可觸發 |
| 前端 log filter | **低**。每人 logs 600 筆級別，.filter 在 modern 裝置 < 1ms。但 re-render 次數頻繁時累積 | 加 useMemo（P2 #5）緩解 |
| `lodash` / `date-fns` 重複載入 | **低**。`date-fns` 已在主 bundle | 非本次變更 |

### 資料庫容量預估

- 200 人 × 60 天 × 平均 10 筆/天 ≈ 120K 筆 DailyLogs — Supabase 免費層綽綽有餘
- UserNineGrid 一筆/人 = 200 筆
- **結論**：DB 規模無壓力，瓶頸在 RPC 鎖與 concurrent write 正確性（見 P1）。

---

## 安全性總結（200 人視角）

| 類別 | 狀態 | 說明 |
|------|------|------|
| RLS（資料層） | ✅ 已收緊 anon 寫入 | `202604190001` 移除 CharacterStats UPDATE、DailyLogs DELETE |
| 橫向越權（IDOR） | ✅ P1 #4 已修 | `lib/auth.ts` signed session cookie + `requireSelf()` 於所有 user-facing server action |
| 計分繞過 | ✅ P1 #2, #3 已修 | `202604200001_wk4_server_enforcement.sql` server 端強制 wk4 條件 + 週內 dedup |
| 競爭條件 | ✅ P1 #1 已修 | `202604200002_nine_grid_cell_atomic.sql` 以 `SELECT FOR UPDATE` + 單一 transaction 原子化 |
| XSS | ✅ 格子 label/description 由 React 自動 escape | 但小隊長輸入介面要確認無 `dangerouslySetInnerHTML` |
| SSRF / Injection | ✅ 本次 diff 無風險 | 所有 DB 存取走 Supabase client，無 raw SQL 拼接 |
| Secret 洩漏 | ✅ `SUPABASE_SERVICE_ROLE_KEY` 僅 server-only | `server-only` import 已加 |

---

## 建議修補順序（上線前）

1. ~~**P1 #2 + #3**~~ ✅ 2026-04-20 完成（`202604200001_wk4_server_enforcement.sql`）
2. ~~**P1 #1**~~ ✅ 2026-04-20 完成（`202604200002_nine_grid_cell_atomic.sql` + `completeCell` 改呼叫 RPC）
3. ~~**P1 #4**~~ ✅ 2026-04-20 完成（`lib/auth.ts` + `requireSelf()` + `lib/checkin-core.ts`；上線前需設定 `AUTH_SESSION_SECRET` 並通知全員重登）
4. ~~**P2 #5–#10**~~ ✅ 2026-04-21 完成（`useMemo` 包裝、`nowTick` 跨午夜、`WeekCalendarRow` 共用化、`updated_at` trigger、ref-based lock、清理 unused props）
5. 其餘 P3（Code quality，非阻擋項）

---

## 未覆蓋範圍

- **未驗證**：本次 diff 實際在瀏覽器跨裝置 / iOS Safari 的行為（UI 視覺可能有差異）
- **未驗證**：DB migration 在 Supabase production 的 rollback 策略
- **未驗證**：現有 `t1` / `wk1` / `wk2` / `wk3_*` 的歷史資料在本次變更後的顯示正確性
- **未檢查**：LINE Bot 端（`app/api/webhook/line`）是否有 quest 相關捷徑

---

## Next Steps

目前共 **4 項 P1**、**6 項 P2**、**3 項 P3**。

**建議處理流程：**

1. **Fix all P1（建議）** — 兩個 migration + 一個 auth helper，估 2–3 小時
2. **Fix P1 #2, #3 only** — 最小必修，估 1 小時
3. **僅記錄不修** — 先上線觀察，後續補齊

請告知欲採用的選項。
