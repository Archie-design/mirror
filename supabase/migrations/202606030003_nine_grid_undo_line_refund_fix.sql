-- 修正九宮格回溯時「連線獎勵未正確收回」的 bug
--
-- 背景：
--   uncomplete_cell_by_captain / undo_nine_grid_cell_self 原本只退
--   `nine_grid_line|cell{被回溯格index}` 這一筆。但連線 log 命名是用「觸發連線的格」，
--   回溯「非觸發格」(同一條線的其他格) 時找不到該 log → 連線已破卻沒退分。
--   例：完成格0、格2 後完成格1 觸發第一列連線 → 記 nine_grid_line|cell1。
--       回溯格0 時只找 nine_grid_line|cell0(不存在) → +3000 連線分殘留。
--
-- 修法：
--   回溯時重算「回溯前 vs 回溯後」的連線數，把連線 log 與分數
--   收斂到「實際連線數 × 3000」(自我修復，無論先前是否已不一致)。

-- ── 1. 小隊長回溯 ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION uncomplete_cell_by_captain(
    p_captain_id     TEXT,
    p_target_user_id TEXT,
    p_cell_index     INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_captain_team   TEXT;
    v_target_team    TEXT;
    v_cells          JSONB;
    v_new_cells      JSONB;
    v_cell           JSONB;
    v_new_lines      INTEGER := 0;
    v_cur_line_score INTEGER := 0;
    v_target_score   INTEGER := 0;
    v_refund         INTEGER := 0;
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

    SELECT "TeamName" INTO v_captain_team
    FROM "CharacterStats"
    WHERE "UserID" = p_captain_id AND "IsCaptain" = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '僅限小隊長操作');
    END IF;

    SELECT "TeamName" INTO v_target_team
    FROM "CharacterStats"
    WHERE "UserID" = p_target_user_id;
    IF v_target_team IS NULL OR v_target_team != v_captain_team THEN
        RETURN jsonb_build_object('success', false, 'error', '目標隊員不在你的小隊');
    END IF;

    SELECT cells INTO v_cells
    FROM "UserNineGrid"
    WHERE member_id = p_target_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '找不到九宮格資料');
    END IF;

    v_cell := v_cells -> p_cell_index;
    IF NOT COALESCE((v_cell->>'completed')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', '此格尚未完成，無需回溯');
    END IF;

    -- 回溯後的 cells（該格設為未完成）
    v_new_cells := jsonb_set(
        jsonb_set(v_cells, ARRAY[p_cell_index::text, 'completed'], 'false'::jsonb),
        ARRAY[p_cell_index::text, 'completed_at'], 'null'::jsonb
    );

    -- 重算回溯後的連線數
    FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
        IF (v_new_cells->v_line[1]->>'completed')::boolean
           AND (v_new_cells->v_line[2]->>'completed')::boolean
           AND (v_new_cells->v_line[3]->>'completed')::boolean
        THEN v_new_lines := v_new_lines + 1; END IF;
    END LOOP;

    -- 寫回 cells、刪格子打卡紀錄
    UPDATE "UserNineGrid"
    SET cells = v_new_cells, updated_at = NOW()
    WHERE member_id = p_target_user_id;

    DELETE FROM "DailyLogs"
    WHERE "UserID" = p_target_user_id
      AND "QuestID" = 'nine_grid_cell|' || p_cell_index::text;

    -- 連線 log 與分數收斂到「實際連線數 × 3000」
    SELECT COALESCE(SUM("RewardPoints"), 0) INTO v_cur_line_score
    FROM "DailyLogs"
    WHERE "UserID" = p_target_user_id AND "QuestID" LIKE 'nine_grid_line|%';

    v_target_score := v_new_lines * 3000;
    v_refund := v_cur_line_score - v_target_score;

    IF v_refund <> 0 THEN
        DELETE FROM "DailyLogs"
        WHERE "UserID" = p_target_user_id AND "QuestID" LIKE 'nine_grid_line|%';
        IF v_target_score > 0 THEN
            INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
            VALUES (NOW(), p_target_user_id, 'nine_grid_line|recalc', '九宮格連線(' || v_new_lines || '條)', v_target_score);
        END IF;
        UPDATE "CharacterStats"
        SET "Score" = GREATEST(0, "Score" - v_refund)
        WHERE "UserID" = p_target_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'scoreReversed', GREATEST(0, v_refund));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION uncomplete_cell_by_captain(TEXT, TEXT, INTEGER) TO service_role;

-- ── 2. 學員自助回溯 ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION undo_nine_grid_cell_self(
    p_user_id    TEXT,
    p_cell_index INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cells          JSONB;
    v_new_cells      JSONB;
    v_cell           JSONB;
    v_new_lines      INTEGER := 0;
    v_cur_line_score INTEGER := 0;
    v_target_score   INTEGER := 0;
    v_refund         INTEGER := 0;
    v_week_start     TIMESTAMPTZ;
    v_completed_at   TIMESTAMPTZ;
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

    v_new_cells := jsonb_set(
        jsonb_set(v_cells, ARRAY[p_cell_index::text, 'completed'], 'false'::jsonb),
        ARRAY[p_cell_index::text, 'completed_at'], 'null'::jsonb
    );

    FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
        IF (v_new_cells->v_line[1]->>'completed')::boolean
           AND (v_new_cells->v_line[2]->>'completed')::boolean
           AND (v_new_cells->v_line[3]->>'completed')::boolean
        THEN v_new_lines := v_new_lines + 1; END IF;
    END LOOP;

    UPDATE "UserNineGrid"
    SET cells = v_new_cells, updated_at = NOW()
    WHERE member_id = p_user_id;

    DELETE FROM "DailyLogs"
    WHERE "UserID" = p_user_id
      AND "QuestID" = 'nine_grid_cell|' || p_cell_index::text;

    SELECT COALESCE(SUM("RewardPoints"), 0) INTO v_cur_line_score
    FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" LIKE 'nine_grid_line|%';

    v_target_score := v_new_lines * 3000;
    v_refund := v_cur_line_score - v_target_score;

    IF v_refund <> 0 THEN
        DELETE FROM "DailyLogs"
        WHERE "UserID" = p_user_id AND "QuestID" LIKE 'nine_grid_line|%';
        IF v_target_score > 0 THEN
            INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
            VALUES (NOW(), p_user_id, 'nine_grid_line|recalc', '九宮格連線(' || v_new_lines || '條)', v_target_score);
        END IF;
        UPDATE "CharacterStats"
        SET "Score" = GREATEST(0, "Score" - v_refund)
        WHERE "UserID" = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'scoreReversed', GREATEST(0, v_refund));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION undo_nine_grid_cell_self(TEXT, INTEGER) TO service_role;
