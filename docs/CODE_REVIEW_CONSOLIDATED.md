# Code Review 總彙整 — 200 人 × 9 週系統

**最後整併**：2026-05-04
**整併輪次**：V1（2026-04-20）+ V2（2026-04-22）+ V3（2026-04-30）+ V4（2026-05-04 新增掃描 + 同日修補）
**活動期間**：2026-05-10 ～ 2026-07-12（9 週，預估 200 人）
**威脅模型**：混合等級（學員為主 + 競賽場域；可繞過計分視為 P1）

---

## 1. 文件用途與閱讀指引

本文件取代原本三份分輪 review（V1/V2/V3），目的是讓營運與工程同事**只看一份**就能理解整個活動期程的程式碼健康度。

- **想知道目前還有哪些風險未處理？** → 跳到 [§4 Findings — 仍待辦](#4-findings--仍待辦)
- **想驗證歷史修補仍有效？** → 跳到 [§3 Findings — 已修補](#3-findings--已修補)
- **想看 7/12 畢典前需做什麼？** → 跳到 [§5 7/12 畢業典禮 checklist](#5-712-畢業典禮-checklist)
- **想追溯某筆修補是哪次 review 提出？** → 各條目皆有 `[V_]` 標籤；原始三份檔案仍保留於 `docs/`，見 [§7 附錄 B](#7-附錄-b原始-review-文件指標)

> 本份文件僅彙整**程式碼層**審查；功能驗收（學員實機操作）仍以 [`FEATURE_AUDIT_2026_05.md`](./FEATURE_AUDIT_2026_05.md) 為準。

---

## 2. 整體健康度總表

### 修補進度

| 類別 | 已修 | 仍待辦 | 總計 |
|------|------|--------|------|
| P1 | 15 | 0 | 15 |
| P2 | 23 | 1（rate limit）| 24 |
| P3 | 7 | 4 | 11 |
| **合計** | **45** | **5** | **50** |

### 健康度評估

| 維度 | 狀態 |
|------|------|
| 計分繞過 / 業務規則 | ✅ 全部修補（wk4、九宮格、temp_、p1_dawn 都有 server enforcement） |
| 身份驗證（IDOR / Auth） | ✅ HMAC session + `requireSelf()` + admin scope 完整；單一 returnTo 重定向待補 |
| RLS（資料層） | ✅ anon WRITE 全封鎖（V2 P2-5），SELECT 限定在 5 張公開讀表 |
| 效能（200 人並發） | ✅ 索引齊備、批量入帳 chunk 平行、N+1 消除；輪詢 visibility 守衛仍待補 |
| 資料一致性 | ✅ 九宮格與 cell `FOR UPDATE` 原子化、updated_at 由 trigger 維護 |
| 衛生 / 維護性 | 🟡 page.tsx（1043 行）+ AdminDashboard.tsx（1607 行）拆分待後續 |
| 容錯（前端） | ✅ 頂層 ErrorBoundary 已加（V4 修補） |

**結論**：5/10 上線就緒。V4 全部 P1/P2 已於 2026-05-04 修補完畢。剩餘為活動後重構與全域 rate limit（保留至上線後觀察），不阻塞上線。

---

## 3. Findings — 已修補

### 3.1 計分繞過（業務規則 server enforcement）

| # | 議題 | 修補位置 | 來源 |
|---|------|---------|------|
| 1 | 九宮格 cells JSONB race（雙擊兩格覆蓋彼此） | `process_nine_grid_cell` RPC + `SELECT FOR UPDATE` | [V1] migration `202604200002_nine_grid_cell_atomic.sql` |
| 2 | wk4 分享「當週需 ≥1 格」僅前端驗證 | `process_checkin` 加 `wk4_*` 分支 | [V1] migration `202604200001_wk4_server_enforcement.sql` |
| 3 | wk4 RPC 無週內 dedup（每天 questId 不同可刷 7 次） | 同上 | [V1] migration `202604200001` |
| 4 | 臨時加碼任務每日 1 次僅前端，server 無檢查 | RPC 加 `temp_%` 分支 | [V2] migration `202604220002_temp_quest_dedup.sql` |
| 5 | p1_dawn 跨午邊界 1ms 窗口 | RPC 加跨午保護 | [V3] migration `202604300001_fix_p1_dawn_cross_noon.sql` |
| 6 | p1_dawn 應僅限午前打卡 | RPC 加 12:00 TW 限制 | [V3] migration `202604300002_restrict_p1_dawn_before_noon.sql` |

### 3.2 身份驗證、IDOR、Admin Scope

| # | 議題 | 修補位置 | 來源 |
|---|------|---------|------|
| 7 | server action 信任 client 傳入 userId | HMAC signed cookie + `requireSelf()` | [V1] `lib/auth.ts` + 全部 user-facing actions |
| 8 | `getBonusApplications` 無 auth，洩漏全體申請 | 加 4 層 scope（admin / 大隊長 / 小隊長 / 學員）| [V2] `bonus.ts:260-342` |
| 9 | `getAdminActivityLog` 無 auth | 加 `verifyAdminSession()` | [V2] `bonus.ts:294-305` |
| 10 | `getCourseAttendanceList` / `markAttendance` 任何人可讀整班 | 加志工密碼 timing-safe 比對 | [V2] `course.ts` + Scanner.tsx + CourseTab.tsx |
| 11 | LINE bind state 可被綁架（受害者帳號被其他 LINE 綁定）| HMAC signed payload（uid + nonce + 10min expireTs）| [V2] `lib/auth.ts:100-153` + LINE callback |
| 12 | OAuth state 無 HMAC / CSRF | 同上 | [V2] [合併修補] |
| 13 | QR 掃碼：大隊長可掃跨大隊 QR | 反查小隊任一成員 SquadName 比對 battalion | [V2] `squad-gathering.ts:334-353` |
| 14 | 大隊長 scope invariant 隱式依賴 | 補不變式註解 | [V3] `bonus.ts:377-389` |
| 15 | `ADMIN_SESSION_SECRET` 缺失時 fallback 至密碼 | production guard，缺則 throw | [V3] `admin-auth.ts:23-29`（已更名 `AUTH_SESSION_SECRET`） |

### 3.3 RLS（資料層）

| # | 議題 | 修補位置 | 來源 |
|---|------|---------|------|
| 16 | RLS 形同虛設 — anon key 可任意 INSERT/UPDATE/DELETE | 封鎖 anon WRITE 全表；保留 5 張表 SELECT | [V2] migration `202604220003_rls_tighten_anon_writes.sql` |
| 17 | 3 處 client 直接寫入需移到 server action | `updateSystemSetting` / temp quest CRUD / `updateUserFortunes` | [V2] `admin.ts` + `nine-grid.ts` |

### 3.4 效能與索引

| # | 議題 | 修補位置 | 來源 |
|---|------|---------|------|
| 18 | DailyLogs 查詢無日期上界，全表掃描風險 | 全部加 30 天 cutoff | [V2] `app/page.tsx` + `team.ts` |
| 19 | BonusApplications 缺複合索引 | 新增 4 個複合索引 | [V2] migration `202604220001_bonusapps_composite_indexes.sql` |
| 20 | 排行榜每 60s 拉全表 | 快取延長至 5 分鐘 + `.limit(500)` | [V2] `app/page.tsx:636-648` |
| 21 | RankTab 大隊長計算 O(n²) | `squadsByBattalion: Map` 索引 | [V2] `RankTab.tsx` |
| 22 | `bulkReviewBonusByAdmin` 序列入帳 100 筆 = 8 秒 | 改 chunk-of-10 `Promise.all` 平行 | [V3] `bonus.ts:242-282` |
| 23 | `listPendingGatherings` N+1（每筆 2 query） | 改批次 `.in()` + 記憶體分組 | [V3] `squad-gathering.ts:450-498` |
| 24 | `getTeamGatheringContext` 序列重複查詢 | `Promise.all` 平行化 | [V3] `squad-gathering.ts:277-289` |
| 25 | 客戶端三大重型 tab 影響首屏 | `next/dynamic` ssr:false | [V2] `page.tsx:17-28`（Captain/Commandant/Admin）|
| 26 | NineGrid / WeeklyTopic 計算缺 useMemo | 包單一 useMemo | [V1] `NineGridTab.tsx` + `WeeklyTopicTab.tsx` |

### 3.5 資料一致性、衛生、命名

| # | 議題 | 修補位置 | 來源 |
|---|------|---------|------|
| 27 | 跨午夜 `currentWeeklyMonday` 顯示漂移 | `nowTick` setInterval 60s | [V1] `app/page.tsx` |
| 28 | `WeekCalendarRow` 兩處重複實作 | 抽 `components/WeekCalendarRow.tsx` 共用 | [V1] |
| 29 | `updated_at` 由應用層寫入，與 NOW() 不同步 | `BEFORE UPDATE` trigger | [V1] migration `202604200003` |
| 30 | 雙擊同格觸發兩次 RPC | ref-based lock | [V1] `NineGridCard.tsx` |
| 31 | `WeeklyTopicTab` 多個 unused props | 刪除 | [V1] |
| 32 | 死碼 `updateMemberCellText` | 刪除 | [V2] `nine-grid.ts` |
| 33 | o7 deadline 1ms 邊界（`>` 改 `>=`） | bonus.ts:214 | [V2] |
| 34 | `nowTick` 抽出至獨立 hook | `lib/hooks/useLogicalDate.ts` | [V3] |
| 35 | SystemSettings 載入新 key 被吞掉 | 改 spread + `tryParseJson<T>()` helper | [V3] `app/page.tsx:498-520` |
| 36 | server actions `any` cast 隱藏 schema typo | typed row interfaces + `error instanceof Error` | [V3] `team.ts` + `admin.ts` |
| 37 | 批量操作 100 筆 100 個 AdminLogs 寫入 | 改寫單筆 `*_batch` 彙總 log（成功路徑） | [V3] `bonus.ts:284-303` |
| 38 | CLAUDE.md QuestID 文件與代碼偏離（q1→d1/p1） | 更新文件 | [V3] CLAUDE.md:54-62 |
| 39 | `returnTo` 重定向缺 same-origin 驗證（protocol-relative URL 繞過） | `URL()` 解析 + origin 比對 | [V4] [`app/page.tsx:458-471`](../app/page.tsx#L458-L471) |
| 40 | 缺頂層 ErrorBoundary，子元件單一錯誤白屏整棵樹 | 新增 `components/ErrorBoundary.tsx` 包在 `<body>` 內 | [V4] [`app/layout.tsx`](../app/layout.tsx) + [`components/ErrorBoundary.tsx`](../components/ErrorBoundary.tsx) |
| 41 | 60s tick 隱藏分頁仍跑（CPU 微浪費 + 跨午回前景無立即重算） | `visibilitychange` 暫停 + 回前景補抓 | [V4] [`lib/hooks/useLogicalDate.ts`](../lib/hooks/useLogicalDate.ts) + [`DailyQuestsTab.tsx:144-166`](../components/Tabs/DailyQuestsTab.tsx#L144-L166) |
| 42 | 圖片 upload 缺 MIME 驗證（PDF/影片誤上傳產生模糊錯誤訊息）| 加 `raw.type.startsWith('image/')` 檢查 + 修順帶移除 `any` cast | [V4] [`BonusQuestsSection.tsx:94-122`](../components/Tabs/BonusQuestsSection.tsx#L94-L122) |

---

## 4. Findings — 仍待辦

> V4 新發現的 P1/P2（returnTo / ErrorBoundary / visibility polling / image MIME）已於 **2026-05-04 同日修補**，詳見 §3 Findings #39–#42。

### 4.1 上線前必修（5/9 之前）

✅ 全部修補完畢。

### 4.2 7/12 畢典前

#### V2-P2-6 — 全域 Rate Limit（保留至上線後觀察）

- **位置**：所有 server actions
- **現況**：個別 server action 已有業務層 dedup（打卡 per-day、bonus per-user、凝聚 per-week），全域 IP/uid 限流缺
- **保留理由**：正規做法需外部服務（Upstash / Vercel KV）；200 人封閉活動風險低
- **修補時機**：上線後若觀察到濫用再補；估時 4 小時

### 4.3 活動結束後（7/12 之後）

| # | 議題 | 來源 | 估時 |
|---|------|------|------|
| L1 | `process_checkin` RPC 9 版整併為單一檔案 | [V3] P2-6 | 2h |
| L2 | `app/page.tsx`（1043 行）+ `AdminDashboard.tsx`（1607 行）拆分 | [V3] P2-8 + V4 | 8h |
| L3 | PascalCase / snake_case schema 統一 | [V3] P3-2 | TBD |
| L4 | 7/12 後寫入 freeze（業務決定） | [V2/V3] | 30m |

---

## 5. 7/12 畢業典禮 checklist

### 上線前（5/9）

- [x] 修補 V4-P1-1（returnTo same-origin）— ✅ 2026-05-04
- [x] 修補 V4-P1-3（ErrorBoundary）— ✅ 2026-05-04
- [x] 修補 V4-P1-2（visibility polling — `useLogicalDate` + `DailyQuestsTab`；`CaptainTab` 已有）— ✅ 2026-05-04
- [x] 修補 V4-P2-1（image MIME）— ✅ 2026-05-04
- [ ] 環境變數確認：`AUTH_SESSION_SECRET`（≥32 byte）+ `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Supabase migrations 全部跑完（特別是 V3 的 `202605010001-3` 三支）
- [ ] 全員 LINE 重登公告（cookie 不相容）
- [ ] 設定 `SystemSettings.VolunteerPassword`
- [ ] 三角色實機跑一輪（學員 → 小隊長 → 大隊長）

### 畢典前（7 月初）

- [ ] Supabase 連線池確認 ≥ 100（升 Pro 或 enterprise pool）
- [ ] 6/29 起每日 22:00 拉 BonusApplications count 監控積壓
- [ ] 7/11 18:00 前確認 o7 申請流程順暢
- [ ] 大隊長、小隊長提前 2 天清空待審清單
- [ ] 排行榜快取確認在 5 分鐘
- [ ] 考慮 7/11 24:00 起關閉撤銷打卡功能

### 直播當天

- [ ] 工程值班（Supabase Dashboard 監控 Compute usage）
- [ ] 異常 fallback 流程演練（看 ErrorBoundary 觸發、cron 失敗）

---

## 6. 附錄 A：版本演進時間軸

| 日期 | 輪次 | 重點 | 結果 |
|------|------|------|------|
| 2026-04-20 | V1 | 九宮格 + wk4 重構落地，初次安全審查 | 4 P1 + 6 P2 全修 |
| 2026-04-22 | V2 | 全系統第二輪（auth、bonus、course、RLS） | 7 P1 + 7 P2 修，1 P2 保留（rate limit） |
| 2026-04-30 | V3 | 第三輪（cron snapshot、p1_dawn、admin scope） | 1 P1 + 8 P2 + 3 P3 修，3 項活動後重構 |
| 2026-05-04 | V4 | post-V3 16 commit 掃描（LINE Login 管理員、F1–F7、image upload、auto-checkin URL） | 3 P1 + 1 P2 新發現，**同日修補完畢** |

### V4 對 agent 誤判的剔除

下列 audit agent 標記為 P0/P1，經比對代碼後判定為**不是新風險**，故未列入 §4：

1. ❌ `resetSeasonData` 客戶端日期檢查 → 實際 `new Date()` 為 server-side（[admin.ts:858](../app/actions/admin.ts#L858)），且 `today >= '2026-05-10'` 自動鎖定
2. ❌ Auto-checkin URL 可身份冒充 → `scanGatheringQR` 開頭 `requireSelf(userId)`（[squad-gathering.ts:328](../app/actions/squad-gathering.ts#L328)），signed cookie 為實際信任邊界，localStorage uid 僅顯示用
3. ❌ `setMemberAdminStatus` / `adjustMemberScore` / `deleteCheckInRecord` 缺 2FA → 200 人封閉活動以 admin password + LINE Login 為單因子已足夠；要求 2FA 屬規格決定，不是 bug
4. ❌ `purgeTestAccounts` race condition → 僅在活動前清測試帳號使用，5/10 後 `resetSeasonData` 自鎖，無攻擊面
5. ❌ `exportMembersWithSummary` IDOR → 開頭 `verifyAdminSession()` + commandant scope；agent 想像「session cookie 被劫持後改 DB」屬於 super-set 場景，非當前威脅模型

---

## 7. 附錄 B：原始 review 文件指標

下列三份檔案為各輪原始 review，**已完整整合至本文件**，保留作歷史紀錄用：

- [`CODE_REVIEW_200_USERS.md`](./CODE_REVIEW_200_USERS.md) — V1（2026-04-20）
- [`CODE_REVIEW_200_USERS_V2.md`](./CODE_REVIEW_200_USERS_V2.md) — V2（2026-04-22）
- [`CODE_REVIEW_200_USERS_V3.md`](./CODE_REVIEW_200_USERS_V3.md) — V3（2026-04-30）

未來新增 review 請直接擴充本文件 §4「仍待辦」與 §6「版本演進時間軸」，不再開新檔案。
