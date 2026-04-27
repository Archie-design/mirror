-- ============================================================
-- P2-5 RLS 收緊：封鎖 anon 寫入，保留 anon SELECT
-- ============================================================
-- 背景：
--   原 schema 對多數表使用 `USING (true)` / `WITH CHECK (true)`，
--   anon key 可直接 INSERT/UPDATE/DELETE 任何表（CharacterStats 分數、DailyLogs 打卡、BonusApplications 狀態...）
--   所有業務邏輯已改走 server action + service_role key（service_role 預設 bypass RLS）
--   此 migration 移除所有 anon 寫入權限，並確保讀取路徑維持可用
--
-- 前置條件（必驗）：
--   1. production env 已設 `SUPABASE_SERVICE_ROLE_KEY`（否則所有 server action 會 500）
--   2. 所有 client 端 `.insert/.update/.delete/.upsert` 已全部遷移至 server action：
--      - SystemSettings upsert       → app/actions/admin.ts: updateSystemSetting
--      - temporaryquests CRUD        → app/actions/admin.ts: addTempQuest / toggleTempQuest / deleteTempQuest
--      - CharacterStats fortunes UPDATE → app/actions/nine-grid.ts: updateUserFortunes
--   3. client 端仍以 anon 直接讀取的 5 張表（CharacterStats / DailyLogs / TeamSettings / SystemSettings / temporaryquests）
--      SELECT policy 需保留
--
-- 回退策略：
--   若 production 缺 SUPABASE_SERVICE_ROLE_KEY 導致 server action 失敗，可單獨為少數 action 建立 policy，
--   或 revert 此 migration 還原 anon 寫入。不要讓一批 action 長時間失敗。

-- ── CharacterStats ────────────────────────────────────────────────────
-- UPDATE 已於 202604190001 drop，此處 drop INSERT
DROP POLICY IF EXISTS "Allow public insert on CharacterStats" ON public."CharacterStats";
-- SELECT 保留（排行榜用）

-- ── DailyLogs ────────────────────────────────────────────────────────
-- DELETE 已於 202604190001 drop，此處 drop INSERT
DROP POLICY IF EXISTS "Allow public insert on DailyLogs" ON public."DailyLogs";
-- SELECT 保留（使用者歷史用）

-- ── TeamSettings ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public insert on TeamSettings" ON public."TeamSettings";
DROP POLICY IF EXISTS "Allow public update on TeamSettings" ON public."TeamSettings";
-- SELECT 保留

-- ── SystemSettings ───────────────────────────────────────────────────
-- 原為 FOR ALL，會同時允許 SELECT，drop 後要補回 SELECT policy
DROP POLICY IF EXISTS "Allow public upsert on SystemSettings" ON public."SystemSettings";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'SystemSettings' AND policyname = 'Allow public read on SystemSettings') THEN
    CREATE POLICY "Allow public read on SystemSettings" ON public."SystemSettings" FOR SELECT USING (true);
  END IF;
END $$;

-- ── temporaryquests ──────────────────────────────────────────────────
-- 原名為 "Service role write" 但 policy 實際為 FOR ALL USING (true)，drop
DROP POLICY IF EXISTS "Service role write temporaryquests" ON public.temporaryquests;
-- SELECT policy 原本已存在（保留）

-- ── BonusApplications ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public insert on BonusApplications" ON public."BonusApplications";
DROP POLICY IF EXISTS "Allow public update on BonusApplications" ON public."BonusApplications";
-- SELECT 保留（但實際上 client 不讀，是 server action 讀；保留無害）

-- ── AdminActivityLog ─────────────────────────────────────────────────
-- 僅 server action (logAdminAction) 寫入
DROP POLICY IF EXISTS "Allow public insert on AdminActivityLog" ON public."AdminActivityLog";
-- SELECT 保留（但 server action 已加 verifyAdminSession gate）

-- ── Rosters / CourseRegistrations / CourseAttendance / TopicHistory ──
-- ── MandatoryQuestHistory / SquadGatheringCheckins / NineGridTemplates ──
-- ── UserNineGrid / Testimonies / LineGroups / FinePayments / SquadFineSubmissions ──
-- 以上均為 FOR ALL USING (true)，drop 後依 client 讀取需求決定是否補 SELECT
DROP POLICY IF EXISTS "Allow admin full access on Rosters" ON public."Rosters";
DROP POLICY IF EXISTS "Allow public access on CourseRegistrations" ON public."CourseRegistrations";
DROP POLICY IF EXISTS "Allow public access on CourseAttendance" ON public."CourseAttendance";
DROP POLICY IF EXISTS "Service role write TopicHistory" ON public."TopicHistory";
DROP POLICY IF EXISTS "Allow public access on MandatoryQuestHistory" ON public."MandatoryQuestHistory";
DROP POLICY IF EXISTS "Allow public access on SquadGatheringCheckins" ON public."SquadGatheringCheckins";
DROP POLICY IF EXISTS "Allow public access on NineGridTemplates" ON public."NineGridTemplates";
DROP POLICY IF EXISTS "Allow public access on UserNineGrid" ON public."UserNineGrid";
DROP POLICY IF EXISTS "Allow service role access on Testimonies" ON public."Testimonies";
DROP POLICY IF EXISTS "Allow service role access on LineGroups" ON public."LineGroups";
DROP POLICY IF EXISTS "Allow public access on FinePayments" ON public."FinePayments";
DROP POLICY IF EXISTS "Allow public access on SquadFineSubmissions" ON public."SquadFineSubmissions";

-- 上述表中 TopicHistory 原 client 讀不到，server action 讀（service_role bypass）；不需補 SELECT
-- 以下保留 SELECT（client 可能透過 server action 或間接路徑需要）：無需，因為 server action 走 service_role

-- ── 新 schema 中無 RLS 的 table：啟用 RLS，僅允許 service_role 進入 ────
-- 這些 table 是 2026-04 新增（SquadGatheringSessions/SquadGatheringAttendances/OnlineGatheringApplications）
-- 先啟用 RLS；沒有 policy 即代表 anon 無法讀寫；service_role 不受 RLS 約束
ALTER TABLE public."SquadGatheringSessions"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SquadGatheringAttendances"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OnlineGatheringApplications" ENABLE ROW LEVEL SECURITY;

-- ── 收緊後驗證提示（手動執行以確認 anon 確實被擋下）──────────────
-- 以 anon key 嘗試：
--   INSERT INTO "CharacterStats" ... → 應回 permission denied / RLS blocked
--   UPDATE "DailyLogs" ...           → 應回 permission denied
-- 以 service_role key 在 server action 內：應可正常讀寫
