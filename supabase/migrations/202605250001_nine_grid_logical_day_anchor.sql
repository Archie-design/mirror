-- 九宮格 RPC 的「本週」判定改用邏輯日 anchor
--
-- 背景:
--   process_nine_grid_cell 與 undo_nine_grid_cell_self 內部用
--   season_week_start(now()) 判斷「本週」,now() 是伺服器日曆時間。
--   5/25 凌晨 00:00(週一日曆翻頁)系統會立刻認為已進 W3,但學員此時
--   仍在 W2 邏輯日(中午 12:00 才翻),造成:
--     - undo:上週(W2)完成的格子無法回溯,跳「僅限本週」錯誤
--     - process:可能繞過「每週一格」上限(W2 已完成 1 格 + 新 W3 視為空週)
--
-- 修法:新增 logical_now_anchor() SQL helper(中午前回傳前一天的 TW
--      日曆日 00:00 +08),把上述兩處 season_week_start(now()) 改成
--      season_week_start(logical_now_anchor())。

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 0. 新 helper:logical_now_anchor()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION logical_now_anchor()
RETURNS timestamptz
LANGUAGE sql STABLE AS $$
    SELECT (
        CASE
            WHEN EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Taipei') < 12
            THEN ((now() AT TIME ZONE 'Asia/Taipei')::date - 1)
            ELSE  (now() AT TIME ZONE 'Asia/Taipei')::date
        END
    )::timestamp AT TIME ZONE 'Asia/Taipei';
$$;

GRANT EXECUTE ON FUNCTION logical_now_anchor() TO anon, authenticated, service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. process_nine_grid_cell:本週判定改用 logical_now_anchor
--    (唯一差異:第 88 行 season_week_start(now()) → season_week_start(logical_now_anchor()))
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

  -- ── 每週一格限制(賽季週,週一 → 週日;以邏輯日為基準)──────────────────
  v_week_start := season_week_start(logical_now_anchor());
  SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
  WHERE "UserID" = p_user_id
    AND "QuestID" LIKE 'nine_grid_cell|%'
    AND "Timestamp" >= v_week_start;
  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '本週已完成一格,每週限完成一格。如需更改,請先回溯本週已完成的格子。');
  END IF;

  -- ── DailyLogs dedup 二次保險 ─────────────────────────────────────────────
  SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
  WHERE "UserID" = p_user_id
    AND "QuestID" = 'nine_grid_cell|' || p_cell_index;
  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '此格已入帳,不可重複。');
  END IF;

  -- ── 計算舊連線數 ─────────────────────────────────────────────────────────
  FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
    IF (v_cells->v_line[1]->>'completed')::boolean = true
      AND (v_cells->v_line[2]->>'completed')::boolean = true
      AND (v_cells->v_line[3]->>'completed')::boolean = true THEN
      v_old_lines := v_old_lines + 1;
    END IF;
  END LOOP;

  -- ── 標記格子完成 ─────────────────────────────────────────────────────────
  v_now_iso := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_new_cells := jsonb_set(v_cells, ARRAY[p_cell_index::text, 'completed'], 'true'::jsonb);
  v_new_cells := jsonb_set(v_new_cells, ARRAY[p_cell_index::text, 'completed_at'], to_jsonb(v_now_iso));

  -- ── 計算新連線數 ─────────────────────────────────────────────────────────
  FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
    IF (v_new_cells->v_line[1]->>'completed')::boolean = true
      AND (v_new_cells->v_line[2]->>'completed')::boolean = true
      AND (v_new_cells->v_line[3]->>'completed')::boolean = true THEN
      v_new_lines := v_new_lines + 1;
    END IF;
  END LOOP;

  v_new_line_count := v_new_lines - v_old_lines;

  UPDATE "UserNineGrid"
  SET cells = v_new_cells, updated_at = NOW()
  WHERE member_id = p_user_id;

  INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
  VALUES (NOW(), p_user_id, 'nine_grid_cell|' || p_cell_index, '九宮格格子完成', 0);

  IF v_new_line_count > 0 THEN
    v_line_bonus := v_new_line_count * 3000;
    v_line_quest_id := 'nine_grid_line|cell' || p_cell_index;

    UPDATE "CharacterStats"
    SET "Score" = COALESCE("Score", 0) + v_line_bonus
    WHERE "UserID" = p_user_id;

    INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
    VALUES (NOW(), p_user_id, v_line_quest_id, '九宮格連線加分(' || v_new_line_count || '條)', v_line_bonus);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'lineBonus', v_line_bonus,
    'newLinesCompleted', v_new_line_count,
    'totalLinesCompleted', v_new_lines
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. undo_nine_grid_cell_self:本週判定改用 logical_now_anchor
--    (唯一差異:season_week_start(now()) → season_week_start(logical_now_anchor()))
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION undo_nine_grid_cell_self(
    p_user_id    TEXT,
    p_cell_index INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cells         JSONB;
    v_cell          JSONB;
    v_line_log_id   UUID;
    v_line_score    INTEGER := 0;
    v_week_start    TIMESTAMPTZ;
    v_completed_at  TIMESTAMPTZ;
BEGIN
    IF p_cell_index < 0 OR p_cell_index > 8 THEN
        RETURN jsonb_build_object('success', false, 'error', '格子索引無效');
    END IF;

    SELECT cells INTO v_cells
    FROM "UserNineGrid"
    WHERE member_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '找不到九宮格資料');
    END IF;

    v_cell := v_cells -> p_cell_index;
    IF NOT COALESCE((v_cell->>'completed')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', '此格尚未完成,無需回溯');
    END IF;

    -- 僅允許回溯本(邏輯)週完成的格子
    v_week_start := season_week_start(logical_now_anchor());
    IF (v_cell->>'completed_at') IS NOT NULL THEN
        v_completed_at := (v_cell->>'completed_at')::timestamptz;
        IF v_completed_at < v_week_start THEN
            RETURN jsonb_build_object('success', false, 'error', '僅限回溯本週完成的格子,上週或更早的請聯繫小隊長協助。');
        END IF;
    END IF;

    -- 讀取連線加分紀錄(若有)
    SELECT id, "RewardPoints" INTO v_line_log_id, v_line_score
    FROM "DailyLogs"
    WHERE "UserID" = p_user_id
      AND "QuestID" = 'nine_grid_line|cell' || p_cell_index::text
    LIMIT 1;

    IF NOT FOUND THEN
        v_line_score := 0;
    END IF;

    -- 重置格子(completed → false,completed_at → null)
    UPDATE "UserNineGrid"
    SET cells = jsonb_set(
            jsonb_set(v_cells,
                ARRAY[p_cell_index::text, 'completed'], 'false'::jsonb),
            ARRAY[p_cell_index::text, 'completed_at'], 'null'::jsonb
        ),
        updated_at = NOW()
    WHERE member_id = p_user_id;

    -- 刪除格子打卡紀錄
    DELETE FROM "DailyLogs"
    WHERE "UserID" = p_user_id
      AND "QuestID" = 'nine_grid_cell|' || p_cell_index;

    -- 刪除連線加分紀錄並扣回分數
    IF v_line_score > 0 THEN
        DELETE FROM "DailyLogs" WHERE id = v_line_log_id;
        UPDATE "CharacterStats"
        SET "Score" = GREATEST(0, "Score" - v_line_score)
        WHERE "UserID" = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'scoreReversed', v_line_score);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION undo_nine_grid_cell_self(TEXT, INTEGER) TO service_role;
