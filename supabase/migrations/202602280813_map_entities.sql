-- ============================================================
-- 大方圓開運親證班 — 完整資料庫初始化 Migration
-- 所有 CREATE TABLE IF NOT EXISTS 均冪等，可重複執行。
-- 在 Supabase Dashboard > SQL Editor 貼上執行，或透過 psql。
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. CharacterStats  主角色表
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."CharacterStats" (
    "UserID"          TEXT PRIMARY KEY,
    "Name"            TEXT NOT NULL,
    "Role"            TEXT DEFAULT 'default',
    "Level"           INTEGER DEFAULT 1,
    "Exp"             INTEGER DEFAULT 0,
    "Coins"           INTEGER DEFAULT 0,
    "EnergyDice"      INTEGER DEFAULT 3,
    "GoldenDice"      INTEGER DEFAULT 0,
    "Spirit"          INTEGER DEFAULT 0,
    "Physique"        INTEGER DEFAULT 0,
    "Charisma"        INTEGER DEFAULT 0,
    "Savvy"           INTEGER DEFAULT 0,
    "Luck"            INTEGER DEFAULT 0,
    "Potential"       INTEGER DEFAULT 0,
    "Streak"          INTEGER DEFAULT 0,
    "LastCheckIn"     TEXT,
    "TotalFines"      INTEGER DEFAULT 0,
    "FinePaid"        INTEGER DEFAULT 0,
    "CurrentQ"        INTEGER DEFAULT 0,
    "CurrentR"        INTEGER DEFAULT 0,
    "Facing"          INTEGER DEFAULT 0,
    "HP"              INTEGER,
    "MaxHP"           INTEGER,
    "GameGold"        INTEGER DEFAULT 0,
    "GameInventory"   JSONB DEFAULT '[]'::jsonb,
    "Inventory"       JSONB DEFAULT '[]'::jsonb,
    "InitialFortunes" JSONB,
    "DDA_Difficulty"  TEXT DEFAULT 'Normal',
    "Email"           TEXT,
    "SquadName"       TEXT,
    "TeamName"        TEXT,
    "IsCaptain"       BOOLEAN DEFAULT false,
    "IsCommandant"    BOOLEAN DEFAULT false,
    "IsGM"            BOOLEAN DEFAULT false,
    "SquadRole"       TEXT,
    "Birthday"        TEXT,
    "LineUserId"      TEXT,
    "created_at"      TIMESTAMPTZ DEFAULT now()
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
    "Timestamp"    TIMESTAMPTZ DEFAULT now(),
    "RewardPoints" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dailylogs_userid    ON public."DailyLogs"("UserID");
CREATE INDEX IF NOT EXISTS idx_dailylogs_timestamp ON public."DailyLogs"("Timestamp");

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
-- 4. MapEntities  六角地圖實體（怪物、寶箱、傳送門）
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."MapEntities" (
    "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "q"          INTEGER NOT NULL,
    "r"          INTEGER NOT NULL,
    "type"       TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "icon"       TEXT,
    "data"       JSONB,
    "owner_id"   TEXT REFERENCES public."CharacterStats"("UserID") ON DELETE CASCADE,
    "is_active"  BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mapentities_qr       ON public."MapEntities"("q", "r");
CREATE INDEX IF NOT EXISTS idx_mapentities_is_active ON public."MapEntities"("is_active");

ALTER TABLE public."MapEntities" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'MapEntities' AND policyname = 'Allow public read on active map entities') THEN
        CREATE POLICY "Allow public read on active map entities" ON public."MapEntities" FOR SELECT USING (is_active = true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'MapEntities' AND policyname = 'Allow authenticated inserts on MapEntities') THEN
        CREATE POLICY "Allow authenticated inserts on MapEntities" ON public."MapEntities" FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'MapEntities' AND policyname = 'Allow authenticated updates on MapEntities') THEN
        CREATE POLICY "Allow authenticated updates on MapEntities" ON public."MapEntities" FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'MapEntities' AND policyname = 'Allow authenticated deletes on MapEntities') THEN
        CREATE POLICY "Allow authenticated deletes on MapEntities" ON public."MapEntities" FOR DELETE USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 5. Rosters  學員名冊（修正版：補齊 name/birthday/is_commandant）
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

-- 若 Rosters 已存在但缺欄位（舊環境升級用）
ALTER TABLE public."Rosters" ADD COLUMN IF NOT EXISTS "name"          TEXT;
ALTER TABLE public."Rosters" ADD COLUMN IF NOT EXISTS "birthday"      TEXT;
ALTER TABLE public."Rosters" ADD COLUMN IF NOT EXISTS "is_commandant" BOOLEAN DEFAULT false;

-- ──────────────────────────────────────────────────────────
-- 6. SystemSettings  全域設定 (key-value)
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
-- 7. CourseRegistrations / CourseAttendance  課程報名與報到
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
-- 8. TemporaryQuests  臨時任務（管理員新增）
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."TemporaryQuests" (
    "id"         TEXT PRIMARY KEY,
    "title"      TEXT NOT NULL,
    "sub"        TEXT,
    "desc"       TEXT,
    "reward"     INTEGER NOT NULL DEFAULT 0,
    "dice"       INTEGER DEFAULT 0,
    "icon"       TEXT,
    "limit"      INTEGER,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."TemporaryQuests" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'TemporaryQuests' AND policyname = 'Allow public read on TemporaryQuests') THEN
        CREATE POLICY "Allow public read on TemporaryQuests" ON public."TemporaryQuests" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'TemporaryQuests' AND policyname = 'Allow public write on TemporaryQuests') THEN
        CREATE POLICY "Allow public write on TemporaryQuests" ON public."TemporaryQuests" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 9. W4Applications  傳愛分數申請
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."W4Applications" (
    "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"             TEXT NOT NULL,
    "user_name"           TEXT NOT NULL,
    "squad_name"          TEXT,
    "battalion_name"      TEXT,
    "interview_target"    TEXT NOT NULL,
    "interview_date"      TEXT NOT NULL,
    "description"         TEXT,
    "quest_id"            TEXT NOT NULL,
    "status"              TEXT DEFAULT 'pending',
    "squad_review_by"     TEXT,
    "squad_review_at"     TIMESTAMPTZ,
    "squad_review_notes"  TEXT,
    "final_review_by"     TEXT,
    "final_review_at"     TIMESTAMPTZ,
    "final_review_notes"  TEXT,
    "created_at"          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."W4Applications" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'W4Applications' AND policyname = 'Allow public read on W4Applications') THEN
        CREATE POLICY "Allow public read on W4Applications" ON public."W4Applications" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'W4Applications' AND policyname = 'Allow public insert on W4Applications') THEN
        CREATE POLICY "Allow public insert on W4Applications" ON public."W4Applications" FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'W4Applications' AND policyname = 'Allow public update on W4Applications') THEN
        CREATE POLICY "Allow public update on W4Applications" ON public."W4Applications" FOR UPDATE USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 10. AdminActivityLog  管理員操作日誌
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
-- 11. Achievements  成就解鎖記錄
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."Achievements" (
    "user_id"        TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "unlocked_at"    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY ("user_id", "achievement_id")
);

ALTER TABLE public."Achievements" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Achievements' AND policyname = 'Allow public access on Achievements') THEN
        CREATE POLICY "Allow public access on Achievements" ON public."Achievements" FOR ALL USING (true);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 12. FinePayments  罰款付款記錄
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
-- 13. SquadFineSubmissions  劇組向組織繳款記錄
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

-- ──────────────────────────────────────────────────────────
-- 14. MandatoryQuestHistory  每週任務抽籤歷史
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

-- ============================================================
-- RPC Functions
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- R1. add_combat_rewards  戰鬥結算（原子更新）
--     combat.ts: rpc('add_combat_rewards', { p_user_id, p_exp, p_coins, p_dice, p_golden_dice, p_new_hp })
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_combat_rewards(
    p_user_id    TEXT,
    p_exp        INTEGER DEFAULT 0,
    p_coins      INTEGER DEFAULT 0,
    p_dice       INTEGER DEFAULT 0,
    p_golden_dice INTEGER DEFAULT 0,
    p_new_hp     INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public."CharacterStats"
    SET
        "Exp"        = "Exp" + p_exp,
        "Coins"      = "Coins" + p_coins,
        "EnergyDice" = "EnergyDice" + p_dice,
        "GoldenDice" = "GoldenDice" + p_golden_dice,
        "HP"         = COALESCE(p_new_hp, "HP")
    WHERE "UserID" = p_user_id;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- R2. transfer_dice  能量骰子轉移（含餘額檢查）
--     dice.ts: rpc('transfer_dice', { p_from_user, p_to_user, p_amount })
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_dice(
    p_from_user TEXT,
    p_to_user   TEXT,
    p_amount    INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_from_dice INTEGER;
BEGIN
    SELECT "EnergyDice" INTO v_from_dice
    FROM public."CharacterStats"
    WHERE "UserID" = p_from_user
    FOR UPDATE;

    IF v_from_dice IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '找不到來源用戶');
    END IF;

    IF v_from_dice < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', '骰子不足');
    END IF;

    UPDATE public."CharacterStats"
    SET "EnergyDice" = "EnergyDice" - p_amount
    WHERE "UserID" = p_from_user;

    UPDATE public."CharacterStats"
    SET "EnergyDice" = "EnergyDice" + p_amount
    WHERE "UserID" = p_to_user;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ──────────────────────────────────────────────────────────
-- R3. transfer_golden_dice  黃金骰子轉移
--     dice.ts (單用戶扣除): rpc('transfer_golden_dice', { p_from_user, p_amount })
--     team.ts (點對點捐贈): rpc('transfer_golden_dice', { p_from_user, p_to_user, p_amount })
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_golden_dice(
    p_from_user TEXT,
    p_amount    INTEGER,
    p_to_user   TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_from_golden INTEGER;
BEGIN
    SELECT "GoldenDice" INTO v_from_golden
    FROM public."CharacterStats"
    WHERE "UserID" = p_from_user
    FOR UPDATE;

    IF v_from_golden IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '找不到來源用戶');
    END IF;

    IF v_from_golden < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', '黃金骰子不足');
    END IF;

    UPDATE public."CharacterStats"
    SET "GoldenDice" = "GoldenDice" - p_amount
    WHERE "UserID" = p_from_user;

    -- 若有指定目標用戶，轉給對方；否則僅扣除（例如捐給全隊 pool，由應用層另行處理）
    IF p_to_user IS NOT NULL THEN
        UPDATE public."CharacterStats"
        SET "GoldenDice" = "GoldenDice" + p_amount
        WHERE "UserID" = p_to_user;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ──────────────────────────────────────────────────────────
-- R4. global_dice_bonus  全服能量骰子加成
--     combat.ts: rpc('global_dice_bonus', { p_amount: 1 })
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.global_dice_bonus(
    p_amount INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public."CharacterStats"
    SET "EnergyDice" = "EnergyDice" + p_amount;
END;
$$;
