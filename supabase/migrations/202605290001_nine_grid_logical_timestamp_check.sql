-- 修正 process_nine_grid_cell 的每週限制查詢
--
-- 背景:
--   DailyLogs 中的 Timestamp 若是 W2 最後一天（2026-05-24）的「邏輯日」
--   但實際時間戳落在 2026-05-25 00:00~11:59 TW（UTC 前一天 16:00~23:59），
--   原查詢 "Timestamp" >= v_week_start（W3 Monday 00:00+08 = UTC 前日 16:00）
--   會把這筆 W2 記錄誤算進 W3，導致 W3 週限額被提前耗盡。
--
-- 修法:
--   新增 logical_anchor_of(timestamptz) helper，對歷史時間戳套用同樣的
--   「中午前算前一天」邏輯，再用 season_week_start 取得該筆記錄所屬賽季週，
--   只計入所屬賽季週 >= v_week_start（即本週或更新週）的記錄。

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 0. helper：logical_anchor_of(ts) — 對任意時間戳套用邏輯日規則
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION logical_anchor_of(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
    SELECT (
        CASE
            WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Taipei') < 12
            THEN ((ts AT TIME ZONE 'Asia/Taipei')::date - 1)
            ELSE  (ts AT TIME ZONE 'Asia/Taipei')::date
        END
    )::timestamp AT TIME ZONE 'Asia/Taipei';
$$;

GRANT EXECUTE ON FUNCTION logical_anchor_of(timestamptz) TO anon, authenticated, service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. 更新 process_nine_grid_cell：週限制改用邏輯日對齊
--    唯一差異：AND "Timestamp" >= v_week_start
--           → AND season_week_start(logical_anchor_of("Timestamp")) >= v_week_start
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION process_nine_grid_cell(
  p_user_id    TEXT,
  p_cell_index INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grid           RECORD;
  v_cells          JSONB;
  v_new_cells      JSONB;
  v_old_lines      INTEGER := 0;
  v_new_lines      INTEGER := 0;
  v_new_line_count INTEGER := 0;
  v_line_bonus     INTEGER := 0;
  v_line_quest_id  TEXT;
  v_dup_count      INTEGER;
  v_now_iso        TEXT;
  v_week_start     TIMESTAMPTZ;

  v_lines INTEGER[][] := ARRAY[
    ARRAY[0,1,2], ARRAY[3,4,5], ARRAY[6,7,8],
    ARRAY[0,3,6], ARRAY[1,4,7], ARRAY[2,5,8],
    ARRAY[0,4,8], ARRAY[2,4,6]
  ];
  v_line INTEGER[];
BEGIN
  IF p_cell_index < 0 OR p_cell_index > 8 THEN
    RETURN jsonb_build_object('success', false, 'error', '格子索引無效');
  END IF;

  SELECT * INTO v_grid FROM "UserNineGrid"
  WHERE member_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '尚未初始化九宮格,請先選擇旅伴');
  END IF;

  v_cells := v_grid.cells;

  IF v_cells IS NULL OR jsonb_array_length(v_cells) <> 9 THEN
    RETURN jsonb_build_object('success', false, 'error', '九宮格資料異常,請重新初始化');
  END IF;

  IF (v_cells->p_cell_index->>'completed')::boolean = true THEN
    RETURN jsonb_build_object('success', false, 'error', '此格已完成,不可重複打卡');
  END IF;

  -- ── 每週一格限制（以邏輯日為基準，歷史記錄同樣套用邏輯日對齊）────────────
  v_week_start := season_week_start(logical_now_anchor());
  SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
  WHERE "UserID" = p_user_id
    AND "QuestID" LIKE 'nine_grid_cell|%'
    AND season_week_start(logical_anchor_of("Timestamp")) >= v_week_start;
  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '本週已完成一格,每週限完成一格。如需更改,請先回溯本週已完成的格子。');
  END IF;

  -- ── DailyLogs dedup 二次保險 ─────────────────────────────────────────────
  SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
  WHERE "UserID" = p_user_id
    AND "QuestID" = 'nine_grid_cell|' || p_cell_index;
  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '此格已有打卡記錄');
  END IF;

  -- ── 計算目前連線數 ────────────────────────────────────────────────────────
  FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
    IF (v_cells->v_line[1]->>'completed')::boolean
    AND (v_cells->v_line[2]->>'completed')::boolean
    AND (v_cells->v_line[3]->>'completed')::boolean
    THEN v_old_lines := v_old_lines + 1; END IF;
  END LOOP;

  -- ── 更新格子 ─────────────────────────────────────────────────────────────
  v_now_iso := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_new_cells := jsonb_set(
    v_cells,
    ARRAY[p_cell_index::text],
    v_cells->p_cell_index || jsonb_build_object('completed', true, 'completed_at', v_now_iso)
  );

  UPDATE "UserNineGrid"
  SET cells = v_new_cells, updated_at = now()
  WHERE member_id = p_user_id;

  -- ── 計算新連線數 ──────────────────────────────────────────────────────────
  FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
    IF (v_new_cells->v_line[1]->>'completed')::boolean
    AND (v_new_cells->v_line[2]->>'completed')::boolean
    AND (v_new_cells->v_line[3]->>'completed')::boolean
    THEN v_new_lines := v_new_lines + 1; END IF;
  END LOOP;
  v_new_line_count := v_new_lines - v_old_lines;

  -- ── 寫入 DailyLogs（格子本身，0分；獎勵由 cell_score 另計）──────────────
  INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
  VALUES (NOW(), p_user_id, 'nine_grid_cell|' || p_cell_index, '九宮格格子完成', 0);

  -- ── 連線獎勵 ─────────────────────────────────────────────────────────────
  IF v_new_line_count > 0 THEN
    v_line_bonus := v_new_line_count * 3000;
    v_line_quest_id := 'nine_grid_line|cell' || p_cell_index;

    INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
    VALUES (NOW(), p_user_id, v_line_quest_id, '九宮格連線完成', v_line_bonus);

    UPDATE "CharacterStats"
    SET "Score" = "Score" + v_line_bonus
    WHERE "UserID" = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'newLineCount', v_new_line_count,
    'lineBonus', v_line_bonus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_nine_grid_cell(TEXT, INTEGER) TO service_role;
