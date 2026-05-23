-- 賽季週改回「W1 8 天特例 + W2+ 週一-週日」（2026-05-24）
--
-- 推翻 202605230001 的「全週日對齊」決策，回到原始設計：
--   W1 = 2026-05-10(日) ~ 2026-05-17(日) 共 8 天（特例）
--   W2+ = 週一 ~ 週日 7 天
-- 用途：每週任務上限、九宮格每週一格、實體凝聚每週 5000 上限、wk4 互斥
--
-- process_nine_grid_cell / undo_nine_grid_cell_self 內部已用 season_week_start()，
-- 本 migration 只需改 season_week_start() 即可全系統同步。

CREATE OR REPLACE FUNCTION season_week_start(p_ts timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_local_date date;
BEGIN
    v_local_date := (p_ts AT TIME ZONE 'Asia/Taipei')::date;
    -- 第 1 週特例：5/10(日) ~ 5/17(日) 8 天
    IF v_local_date >= DATE '2026-05-10' AND v_local_date <= DATE '2026-05-17' THEN
        RETURN '2026-05-10 00:00:00+08'::timestamptz;
    END IF;
    -- 其他週：標準週一錨（PG date_trunc('week') = 週一）
    RETURN (date_trunc('week', p_ts AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei');
END;
$$;

GRANT EXECUTE ON FUNCTION season_week_start(timestamptz) TO anon, authenticated, service_role;
