-- 排行榜快照 + DailyLogs 區間聚合 RPC
--
-- 目的：
--   1. 提供「上週/上月」歷史排行查詢（live aggregate 在邏輯日跨越後就無法回查）
--   2. 提供小組成長曲線的時序資料來源
--   3. 本週/本月 leaderboard 仍走 live aggregate（最新分數）
--
-- 寫入時機：
--   - WeeklyRankSnapshot：每週日 16:30 UTC（= 週一 00:30 Asia/Taipei）由 cron 寫入
--   - MonthlyRankSnapshot：每月 1 號 16:30 UTC（= 1 號 00:30 Asia/Taipei）由 cron 寫入

-- ── 週榜快照 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WeeklyRankSnapshot" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_monday DATE NOT NULL,                       -- 該週週一 YYYY-MM-DD
    user_id TEXT NOT NULL,
    user_name TEXT,
    team_name TEXT,                                  -- 小隊
    squad_name TEXT,                                 -- 大隊（既有命名）
    week_score INTEGER NOT NULL DEFAULT 0,           -- 該週新增分數（SUM DailyLogs.RewardPoints）
    cumulative_score INTEGER NOT NULL DEFAULT 0,     -- 該週結束時 CharacterStats.Score
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(week_monday, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wrs_week_score ON "WeeklyRankSnapshot"(week_monday, week_score DESC);
CREATE INDEX IF NOT EXISTS idx_wrs_user ON "WeeklyRankSnapshot"(user_id, week_monday DESC);
CREATE INDEX IF NOT EXISTS idx_wrs_team ON "WeeklyRankSnapshot"(team_name, week_monday);

-- ── 月榜快照 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MonthlyRankSnapshot" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_start DATE NOT NULL,                       -- 該月 1 號 YYYY-MM-01
    user_id TEXT NOT NULL,
    user_name TEXT,
    team_name TEXT,
    squad_name TEXT,
    month_score INTEGER NOT NULL DEFAULT 0,
    cumulative_score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(month_start, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mrs_month_score ON "MonthlyRankSnapshot"(month_start, month_score DESC);
CREATE INDEX IF NOT EXISTS idx_mrs_user ON "MonthlyRankSnapshot"(user_id, month_start DESC);

-- ── RLS：anon 可 SELECT、寫入限 service_role ─────────────────────────────────
ALTER TABLE "WeeklyRankSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonthlyRankSnapshot" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'WeeklyRankSnapshot' AND policyname = 'anon_select_wrs') THEN
        CREATE POLICY "anon_select_wrs" ON "WeeklyRankSnapshot" FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'MonthlyRankSnapshot' AND policyname = 'anon_select_mrs') THEN
        CREATE POLICY "anon_select_mrs" ON "MonthlyRankSnapshot" FOR SELECT TO anon USING (true);
    END IF;
END $$;

-- ── DailyLogs 區間聚合 RPC ────────────────────────────────────────────────────
-- 用於「本週/本月榜」live query。回傳每位用戶在 [p_start, p_end) 區間的累積分數。
CREATE OR REPLACE FUNCTION aggregate_dailylogs_by_user(
    p_start TIMESTAMPTZ,
    p_end   TIMESTAMPTZ
) RETURNS TABLE (
    user_id          TEXT,
    user_name        TEXT,
    team_name        TEXT,
    squad_name       TEXT,
    period_score     BIGINT,
    cumulative_score INTEGER
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        cs."UserID"     AS user_id,
        cs."Name"       AS user_name,
        cs."TeamName"   AS team_name,
        cs."SquadName"  AS squad_name,
        COALESCE(SUM(dl."RewardPoints"), 0)::bigint AS period_score,
        cs."Score"      AS cumulative_score
    FROM "CharacterStats" cs
    LEFT JOIN "DailyLogs" dl
      ON dl."UserID" = cs."UserID"
     AND dl."Timestamp" >= p_start
     AND dl."Timestamp" <  p_end
    GROUP BY cs."UserID", cs."Name", cs."TeamName", cs."SquadName", cs."Score"
    ORDER BY period_score DESC;
$$;

GRANT EXECUTE ON FUNCTION aggregate_dailylogs_by_user(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;
