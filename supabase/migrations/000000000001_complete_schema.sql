-- ============================================================
-- 覺醒開運親證班 — 完整資料庫初始化（最終狀態）
-- 整合所有 migration 的最終結果，可在全新 Supabase 專案執行
-- 所有語句均冪等（IF NOT EXISTS），安全重複執行
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. CharacterStats  主角色表（最終狀態：已移除舊欄位）
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."CharacterStats" (
    "UserID"         TEXT PRIMARY KEY,
    "Name"           TEXT NOT NULL,
    "Role"           TEXT DEFAULT 'default',
    "Score"          INTEGER DEFAULT 0,
    "Coins"          INTEGER DEFAULT 0,
    "Spirit"         INTEGER DEFAULT 0,
    "Physique"       INTEGER DEFAULT 0,
    "Charisma"       INTEGER DEFAULT 0,
    "Savvy"          INTEGER DEFAULT 0,
    "Luck"           INTEGER DEFAULT 0,
    "Potential"      INTEGER DEFAULT 0,
    "Streak"         INTEGER DEFAULT 0,
    "LastCheckIn"    TEXT,
    "Facing"         INTEGER DEFAULT 0,
    "HP"             INTEGER,
    "MaxHP"          INTEGER,
    "GameGold"       INTEGER DEFAULT 0,
    "GameInventory"  JSONB DEFAULT '[]'::jsonb,
    "DDA_Difficulty" TEXT DEFAULT 'Normal',
    "Email"          TEXT,
    "SquadName"      TEXT,
    "TeamName"       TEXT,
    "IsCaptain"      BOOLEAN DEFAULT false,
    "IsCommandant"   BOOLEAN DEFAULT false,
    "IsGM"           BOOLEAN DEFAULT false,
    "SquadRole"      TEXT,
    "Birthday"       TEXT,
    "LineUserId"     TEXT,
    "created_at"     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."CharacterStats" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CharacterStats' AND policyname = 'Allow public read on CharacterStats') THEN
        CREATE POLICY "Allow public read on CharacterStats" ON public."CharacterStats" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CharacterStats' AND policyname = 'Allow public insert on CharacterStats') THEN
        CREATE POLICY "Allow public insert on CharacterStats" ON public."CharacterStats" FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CharacterStats' AND policyname = 'Allow public update on CharacterStats') THEN
        CREATE POLICY "Allow public update on CharacterStats" ON public."CharacterStats" FOR UPDATE USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 2. DailyLogs  每日打卡記錄
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."DailyLogs" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "UserID"       TEXT NOT NULL REFERENCES public."CharacterStats"("UserID") ON DELETE CASCADE,
    "QuestID"      TEXT NOT NULL,
    "QuestTitle"   TEXT,
    "Timestamp"    TIMESTAMPTZ DEFAULT now(),
    "RewardPoints" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dailylogs_userid    ON public."DailyLogs"("UserID");
CREATE INDEX IF NOT EXISTS idx_dailylogs_timestamp ON public."DailyLogs"("Timestamp");
CREATE INDEX IF NOT EXISTS idx_dailylogs_questid   ON public."DailyLogs"("QuestID");

ALTER TABLE public."DailyLogs" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'DailyLogs' AND policyname = 'Allow public read on DailyLogs') THEN
        CREATE POLICY "Allow public read on DailyLogs" ON public."DailyLogs" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'DailyLogs' AND policyname = 'Allow public insert on DailyLogs') THEN
        CREATE POLICY "Allow public insert on DailyLogs" ON public."DailyLogs" FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'DailyLogs' AND policyname = 'Allow public delete on DailyLogs') THEN
        CREATE POLICY "Allow public delete on DailyLogs" ON public."DailyLogs" FOR DELETE USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 3. TeamSettings  劇組設定
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."TeamSettings" (
    "team_name"            TEXT PRIMARY KEY,
    "team_coins"           INTEGER DEFAULT 0,
    "inventory"            JSONB DEFAULT '[]'::jsonb,
    "mandatory_quest_id"   TEXT,
    "mandatory_quest_week" TEXT,
    "quest_draw_history"   JSONB DEFAULT '[]'::jsonb,
    "updated_at"           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."TeamSettings" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'TeamSettings' AND policyname = 'Allow public read on TeamSettings') THEN
        CREATE POLICY "Allow public read on TeamSettings" ON public."TeamSettings" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'TeamSettings' AND policyname = 'Allow public insert on TeamSettings') THEN
        CREATE POLICY "Allow public insert on TeamSettings" ON public."TeamSettings" FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'TeamSettings' AND policyname = 'Allow public update on TeamSettings') THEN
        CREATE POLICY "Allow public update on TeamSettings" ON public."TeamSettings" FOR UPDATE USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 4. Rosters  學員名冊（管理員匯入用）
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."Rosters" (
    "email"         TEXT PRIMARY KEY,
    "name"          TEXT,
    "birthday"      TEXT,
    "squad_name"    TEXT,
    "team_name"     TEXT,
    "is_captain"    BOOLEAN DEFAULT false,
    "is_commandant" BOOLEAN DEFAULT false,
    "created_at"    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."Rosters" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Rosters' AND policyname = 'Allow admin full access on Rosters') THEN
        CREATE POLICY "Allow admin full access on Rosters" ON public."Rosters" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 5. SystemSettings  全域設定 (key-value)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."SystemSettings" (
    "SettingName" TEXT PRIMARY KEY,
    "Value"       TEXT
);

ALTER TABLE public."SystemSettings" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'SystemSettings' AND policyname = 'Allow public read on SystemSettings') THEN
        CREATE POLICY "Allow public read on SystemSettings" ON public."SystemSettings" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'SystemSettings' AND policyname = 'Allow public upsert on SystemSettings') THEN
        CREATE POLICY "Allow public upsert on SystemSettings" ON public."SystemSettings" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 6. CourseRegistrations / CourseAttendance  課程報名與報到
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."CourseRegistrations" (
    "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"    TEXT NOT NULL,
    "course_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    UNIQUE ("user_id", "course_key")
);

ALTER TABLE public."CourseRegistrations" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CourseRegistrations' AND policyname = 'Allow public access on CourseRegistrations') THEN
        CREATE POLICY "Allow public access on CourseRegistrations" ON public."CourseRegistrations" FOR ALL USING (true);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public."CourseAttendance" (
    "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"       TEXT NOT NULL,
    "course_key"    TEXT NOT NULL,
    "checked_in_by" TEXT DEFAULT 'admin',
    "attended_at"   TIMESTAMPTZ DEFAULT now(),
    UNIQUE ("user_id", "course_key")
);

ALTER TABLE public."CourseAttendance" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CourseAttendance' AND policyname = 'Allow public access on CourseAttendance') THEN
        CREATE POLICY "Allow public access on CourseAttendance" ON public."CourseAttendance" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 7. temporaryquests  臨時任務（管理員新增，小寫命名）
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.temporaryquests (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    sub         TEXT,
    "desc"      TEXT,
    reward      INTEGER NOT NULL DEFAULT 0,
    limit_count INTEGER NOT NULL DEFAULT 1,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.temporaryquests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'temporaryquests' AND policyname = 'Public read temporaryquests') THEN
        CREATE POLICY "Public read temporaryquests" ON public.temporaryquests FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'temporaryquests' AND policyname = 'Service role write temporaryquests') THEN
        CREATE POLICY "Service role write temporaryquests" ON public.temporaryquests FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 8. BonusApplications  一次性任務申請（含傳愛分數）
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."BonusApplications" (
    "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"            TEXT NOT NULL,
    "user_name"          TEXT NOT NULL,
    "squad_name"         TEXT,
    "battalion_name"     TEXT,
    "interview_target"   TEXT,
    "interview_date"     TEXT,
    "description"        TEXT,
    "quest_id"           TEXT NOT NULL,
    "status"             TEXT DEFAULT 'pending',
    "squad_review_by"    TEXT,
    "squad_review_at"    TIMESTAMPTZ,
    "squad_review_notes" TEXT,
    "final_review_by"    TEXT,
    "final_review_at"    TIMESTAMPTZ,
    "final_review_notes" TEXT,
    "screenshot_url"     TEXT,
    "created_at"         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonusapps_user_id  ON public."BonusApplications"("user_id");
CREATE INDEX IF NOT EXISTS idx_bonusapps_status   ON public."BonusApplications"("status");
CREATE INDEX IF NOT EXISTS idx_bonusapps_quest_id ON public."BonusApplications"("quest_id");

ALTER TABLE public."BonusApplications" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'BonusApplications' AND policyname = 'Allow public read on BonusApplications') THEN
        CREATE POLICY "Allow public read on BonusApplications" ON public."BonusApplications" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'BonusApplications' AND policyname = 'Allow public insert on BonusApplications') THEN
        CREATE POLICY "Allow public insert on BonusApplications" ON public."BonusApplications" FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'BonusApplications' AND policyname = 'Allow public update on BonusApplications') THEN
        CREATE POLICY "Allow public update on BonusApplications" ON public."BonusApplications" FOR UPDATE USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 9. AdminActivityLog  管理員操作日誌
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."AdminActivityLog" (
    "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "action"      TEXT NOT NULL,
    "actor"       TEXT,
    "target_id"   TEXT,
    "target_name" TEXT,
    "details"     JSONB,
    "result"      TEXT DEFAULT 'success',
    "created_at"  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adminlog_created_at ON public."AdminActivityLog"("created_at" DESC);

ALTER TABLE public."AdminActivityLog" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'AdminActivityLog' AND policyname = 'Allow public read on AdminActivityLog') THEN
        CREATE POLICY "Allow public read on AdminActivityLog" ON public."AdminActivityLog" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'AdminActivityLog' AND policyname = 'Allow public insert on AdminActivityLog') THEN
        CREATE POLICY "Allow public insert on AdminActivityLog" ON public."AdminActivityLog" FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 10. TopicHistory  管理員設定過的主題歷史
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."TopicHistory" (
    "id"         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "TopicTitle" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public."TopicHistory" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'TopicHistory' AND policyname = 'Public read TopicHistory') THEN
        CREATE POLICY "Public read TopicHistory" ON public."TopicHistory" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'TopicHistory' AND policyname = 'Service role write TopicHistory') THEN
        CREATE POLICY "Service role write TopicHistory" ON public."TopicHistory" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 11. MandatoryQuestHistory  每週抽籤歷史
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."MandatoryQuestHistory" (
    "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_name" TEXT NOT NULL,
    "quest_id"  TEXT NOT NULL,
    "week"      TEXT NOT NULL,
    "drawn_at"  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."MandatoryQuestHistory" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'MandatoryQuestHistory' AND policyname = 'Allow public access on MandatoryQuestHistory') THEN
        CREATE POLICY "Allow public access on MandatoryQuestHistory" ON public."MandatoryQuestHistory" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 12. SquadGatheringCheckins  小隊定聚掃碼報到記錄
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."SquadGatheringCheckins" (
    "id"            BIGSERIAL PRIMARY KEY,
    "gathering_id"  TEXT NOT NULL,
    "user_id"       TEXT NOT NULL,
    "user_name"     TEXT,
    "checked_in_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE ("gathering_id", "user_id")
);

CREATE INDEX IF NOT EXISTS idx_sgc_gathering_id ON public."SquadGatheringCheckins"("gathering_id");
CREATE INDEX IF NOT EXISTS idx_sgc_user_id      ON public."SquadGatheringCheckins"("user_id");

ALTER TABLE public."SquadGatheringCheckins" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'SquadGatheringCheckins' AND policyname = 'Allow public access on SquadGatheringCheckins') THEN
        CREATE POLICY "Allow public access on SquadGatheringCheckins" ON public."SquadGatheringCheckins" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 13. NineGridTemplates  九宮格公版模板
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."NineGridTemplates" (
    "id"             SERIAL PRIMARY KEY,
    "companion_type" TEXT NOT NULL UNIQUE,
    "cells"          JSONB NOT NULL DEFAULT '[]'::jsonb,
    "cell_score"     INTEGER NOT NULL DEFAULT 100,
    "updated_at"     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."NineGridTemplates" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'NineGridTemplates' AND policyname = 'Allow public access on NineGridTemplates') THEN
        CREATE POLICY "Allow public access on NineGridTemplates" ON public."NineGridTemplates" FOR ALL USING (true);
    END IF;
END $$;

-- 插入 5 種旅伴的預設空模板
INSERT INTO public."NineGridTemplates" (companion_type, cells, cell_score) VALUES
('事業運', '[
  {"label":"任務1","description":""},{"label":"任務2","description":""},{"label":"任務3","description":""},
  {"label":"任務4","description":""},{"label":"任務5","description":""},{"label":"任務6","description":""},
  {"label":"任務7","description":""},{"label":"任務8","description":""},{"label":"任務9","description":""}
]', 100),
('財富運', '[
  {"label":"任務1","description":""},{"label":"任務2","description":""},{"label":"任務3","description":""},
  {"label":"任務4","description":""},{"label":"任務5","description":""},{"label":"任務6","description":""},
  {"label":"任務7","description":""},{"label":"任務8","description":""},{"label":"任務9","description":""}
]', 100),
('情感運', '[
  {"label":"任務1","description":""},{"label":"任務2","description":""},{"label":"任務3","description":""},
  {"label":"任務4","description":""},{"label":"任務5","description":""},{"label":"任務6","description":""},
  {"label":"任務7","description":""},{"label":"任務8","description":""},{"label":"任務9","description":""}
]', 100),
('家庭運', '[
  {"label":"任務1","description":""},{"label":"任務2","description":""},{"label":"任務3","description":""},
  {"label":"任務4","description":""},{"label":"任務5","description":""},{"label":"任務6","description":""},
  {"label":"任務7","description":""},{"label":"任務8","description":""},{"label":"任務9","description":""}
]', 100),
('體能運', '[
  {"label":"任務1","description":""},{"label":"任務2","description":""},{"label":"任務3","description":""},
  {"label":"任務4","description":""},{"label":"任務5","description":""},{"label":"任務6","description":""},
  {"label":"任務7","description":""},{"label":"任務8","description":""},{"label":"任務9","description":""}
]', 100)
ON CONFLICT (companion_type) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 14. UserNineGrid  學員個人九宮格
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."UserNineGrid" (
    "id"             SERIAL PRIMARY KEY,
    "member_id"      TEXT NOT NULL UNIQUE,
    "companion_type" TEXT NOT NULL,
    "cells"          JSONB NOT NULL DEFAULT '[]'::jsonb,
    "cell_score"     INTEGER NOT NULL DEFAULT 100,
    "created_at"     TIMESTAMPTZ DEFAULT now(),
    "updated_at"     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_nine_grid_member ON public."UserNineGrid"("member_id");

ALTER TABLE public."UserNineGrid" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'UserNineGrid' AND policyname = 'Allow public access on UserNineGrid') THEN
        CREATE POLICY "Allow public access on UserNineGrid" ON public."UserNineGrid" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 15. Testimonies  LINE 見證回報
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."Testimonies" (
    "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "line_user_id"     TEXT NOT NULL,
    "line_group_id"    TEXT,
    "display_name"     TEXT,
    "parsed_name"      TEXT,
    "parsed_date"      TEXT,
    "parsed_category"  TEXT,
    "content"          TEXT,
    "raw_message"      TEXT,
    "created_at"       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonies_created_at ON public."Testimonies"("created_at" DESC);

ALTER TABLE public."Testimonies" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Testimonies' AND policyname = 'Allow service role access on Testimonies') THEN
        CREATE POLICY "Allow service role access on Testimonies" ON public."Testimonies" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 16. LineGroups  LINE 群組記錄
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."LineGroups" (
    "group_id"   TEXT PRIMARY KEY,
    "group_name" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."LineGroups" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'LineGroups' AND policyname = 'Allow service role access on LineGroups') THEN
        CREATE POLICY "Allow service role access on LineGroups" ON public."LineGroups" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 17. FinePayments  罰款付款記錄
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."FinePayments" (
    "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"             TEXT NOT NULL,
    "user_name"           TEXT,
    "squad_name"          TEXT,
    "amount"              INTEGER NOT NULL DEFAULT 0,
    "period_label"        TEXT,
    "paid_to_captain_at"  TEXT,
    "recorded_by"         TEXT,
    "submitted_to_org_at" TEXT,
    "created_at"          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."FinePayments" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'FinePayments' AND policyname = 'Allow public access on FinePayments') THEN
        CREATE POLICY "Allow public access on FinePayments" ON public."FinePayments" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 18. SquadFineSubmissions  劇組向組織繳款記錄
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."SquadFineSubmissions" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "squad_name"   TEXT NOT NULL,
    "amount"       INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TEXT,
    "recorded_by"  TEXT,
    "notes"        TEXT,
    "created_at"   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."SquadFineSubmissions" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'SquadFineSubmissions' AND policyname = 'Allow public access on SquadFineSubmissions') THEN
        CREATE POLICY "Allow public access on SquadFineSubmissions" ON public."SquadFineSubmissions" FOR ALL USING (true);
    END IF;
END $$;

-- ============================================================
-- RPC Functions
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- R1. process_checkin  打卡交易函式（最終版：支援 d/p/diet/dawn）
-- ──────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.process_checkin(TEXT,TEXT,TEXT,INTEGER,TEXT);
DROP FUNCTION IF EXISTS public.process_checkin(TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT[],TEXT);

CREATE OR REPLACE FUNCTION public.process_checkin(
  p_user_id       TEXT,
  p_quest_id      TEXT,
  p_quest_title   TEXT,
  p_quest_reward  INTEGER,
  p_logical_today TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user      RECORD;
  v_dup_count INTEGER;
  v_cap_count INTEGER;
  v_new_score INTEGER;

  -- 基本定課 IDs（d1–d8，每日上限 3 項）
  v_basic_ids    TEXT[] := ARRAY['d1','d2','d3','d4','d5','d6','d7','d8'];
  -- 加權定課 IDs（p1–p5，每日上限 3 項，與基本定課各自獨立）
  v_weighted_ids TEXT[] := ARRAY['p1','p2','p3','p4','p5'];
  -- 飲控 IDs（每日擇一，不佔用定課名額）
  v_diet_ids     TEXT[] := ARRAY['diet_veg','diet_seafood'];
BEGIN
  -- 鎖定使用者列
  SELECT * INTO v_user FROM public."CharacterStats" WHERE "UserID" = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '查無此用戶: ' || p_user_id);
  END IF;

  -- ── 基本定課（d1–d8）：每日上限 3 項，每種各 1 次 ──────────────────
  IF p_quest_id = ANY(v_basic_ids) THEN
    SELECT COUNT(*) INTO v_dup_count FROM public."DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = p_quest_id
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此定課今日已完成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM public."DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_basic_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_cap_count >= 3 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日基本定課已達上限（3 項）。');
    END IF;

  -- ── 加權定課（p1–p5）：每日上限 3 項 ──────────────────────────────
  ELSIF p_quest_id = ANY(v_weighted_ids) THEN
    SELECT COUNT(*) INTO v_dup_count FROM public."DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = p_quest_id
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此定課今日已完成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM public."DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_weighted_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_cap_count >= 3 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日加權定課已達上限（3 項）。');
    END IF;

  -- ── 破曉打拳（p1_dawn）：需同日已完成 p1，不佔名額 ────────────────
  ELSIF p_quest_id = 'p1_dawn' THEN
    SELECT COUNT(*) INTO v_dup_count FROM public."DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = 'p1'
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '需先完成打拳（p1）才能記錄破曉打拳加成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM public."DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = 'p1_dawn'
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_cap_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日破曉打拳加成已記錄。');
    END IF;

  -- ── 飲控（diet_veg / diet_seafood）：每日擇一 ──────────────────────
  ELSIF p_quest_id = ANY(v_diet_ids) THEN
    SELECT COUNT(*) INTO v_dup_count FROM public."DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_diet_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日飲控已記錄，每日只能擇一。');
    END IF;
  END IF;
  -- 其他任務（週課、九宮格、一次性）：無每日上限，由呼叫端自行驗證重複

  -- ── 計算新分數並更新 ─────────────────────────────────────────────────
  v_new_score := COALESCE(v_user."Score", 0) + p_quest_reward;

  UPDATE public."CharacterStats" SET
    "Score"       = v_new_score,
    "LastCheckIn" = p_logical_today
  WHERE "UserID" = p_user_id;

  INSERT INTO public."DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
  VALUES (NOW(), p_user_id, p_quest_id, p_quest_title, p_quest_reward);

  SELECT * INTO v_user FROM public."CharacterStats" WHERE "UserID" = p_user_id;
  RETURN jsonb_build_object('success', true, 'rewardCapped', false, 'user', row_to_json(v_user));

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────
-- R2. clear_today_logs  清除今日打卡記錄（管理員用）
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clear_today_logs(
  p_user_id       TEXT,
  p_logical_today TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score_to_deduct INTEGER := 0;
  v_user            RECORD;
  v_new_score       INTEGER;
BEGIN
  SELECT COALESCE(SUM("RewardPoints"), 0) INTO v_score_to_deduct
  FROM public."DailyLogs"
  WHERE "UserID" = p_user_id
    AND CASE
          WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
          THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
          ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
        END = p_logical_today;

  DELETE FROM public."DailyLogs"
  WHERE "UserID" = p_user_id
    AND CASE
          WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
          THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
          ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
        END = p_logical_today;

  SELECT * INTO v_user FROM public."CharacterStats" WHERE "UserID" = p_user_id FOR UPDATE;
  v_new_score := GREATEST(0, COALESCE(v_user."Score", 0) - v_score_to_deduct);

  UPDATE public."CharacterStats" SET "Score" = v_new_score WHERE "UserID" = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
