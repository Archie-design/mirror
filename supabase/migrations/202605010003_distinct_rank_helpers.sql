-- 排行榜輔助 RPC：DB 層 DISTINCT 週 / 月清單
--
-- 問題：listAvailableWeeks / listAvailableMonths 原本拉取 limit*200 筆資料後
--       在應用層用 JS Set 去重，隨使用者增長浪費大量傳輸量。
--       getSquadGrowthChart 對 WeeklyRankSnapshot 無限制地全表掃描 week_monday。
-- 修法：在 DB 層使用 DISTINCT + ORDER + LIMIT 直接回傳清單，利用既有索引做到 O(1)。

CREATE OR REPLACE FUNCTION get_distinct_week_mondays(p_limit INTEGER DEFAULT 12)
RETURNS TABLE(week_monday DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT DISTINCT wrs.week_monday
    FROM "WeeklyRankSnapshot" wrs
    ORDER BY wrs.week_monday DESC
    LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_distinct_month_starts(p_limit INTEGER DEFAULT 12)
RETURNS TABLE(month_start DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT DISTINCT mrs.month_start
    FROM "MonthlyRankSnapshot" mrs
    ORDER BY mrs.month_start DESC
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_distinct_week_mondays(INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_distinct_month_starts(INTEGER) TO anon, authenticated, service_role;
