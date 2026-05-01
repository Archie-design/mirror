-- 小隊長回溯九宮格打卡（原子化 RPC）
--
-- 問題：原本 uncompleteCellByCapt server action 用多步 Supabase JS 操作，
--       中途失敗會留下不一致狀態（格子重置但紀錄殘留、分數漏扣等）。
-- 修法：整個流程移入 PL/pgSQL transaction，SELECT FOR UPDATE 鎖定 UserNineGrid，
--       保證原子性。
--
-- 呼叫：supabase.rpc('uncomplete_cell_by_captain', { p_captain_id, p_target_user_id, p_cell_index })
-- 回傳：JSONB { success, scoreReversed } | { success: false, error }

CREATE OR REPLACE FUNCTION uncomplete_cell_by_captain(
    p_captain_id    TEXT,
    p_target_user_id TEXT,
    p_cell_index    INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_captain_team  TEXT;
    v_target_team   TEXT;
    v_cells         JSONB;
    v_cell          JSONB;
    v_line_log_id   UUID;
    v_line_score    INTEGER := 0;
BEGIN
    -- 驗證格子索引
    IF p_cell_index < 0 OR p_cell_index > 8 THEN
        RETURN jsonb_build_object('success', false, 'error', '格子索引無效');
    END IF;

    -- 驗證呼叫者為小隊長，同時取得其隊名
    SELECT "TeamName" INTO v_captain_team
    FROM "CharacterStats"
    WHERE "UserID" = p_captain_id AND "IsCaptain" = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '僅限小隊長操作');
    END IF;

    -- 驗證目標隊員屬於同一小隊
    SELECT "TeamName" INTO v_target_team
    FROM "CharacterStats"
    WHERE "UserID" = p_target_user_id;

    IF v_target_team IS NULL OR v_target_team != v_captain_team THEN
        RETURN jsonb_build_object('success', false, 'error', '目標隊員不在你的小隊');
    END IF;

    -- 鎖定 UserNineGrid row，防止並行操作產生 race condition
    SELECT cells INTO v_cells
    FROM "UserNineGrid"
    WHERE member_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '找不到九宮格資料');
    END IF;

    -- 確認格子已完成
    v_cell := v_cells -> p_cell_index;
    IF NOT COALESCE((v_cell->>'completed')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', '此格尚未完成，無需回溯');
    END IF;

    -- 讀取連線加分 log（九宮格連線，QuestID = nine_grid_line|cell{idx}）
    SELECT id, "RewardPoints" INTO v_line_log_id, v_line_score
    FROM "DailyLogs"
    WHERE "UserID" = p_target_user_id
      AND "QuestID" = 'nine_grid_line|cell' || p_cell_index::text
    LIMIT 1;

    IF NOT FOUND THEN
        v_line_score := 0;
    END IF;

    -- 重置格子（completed → false，completed_at → null）
    UPDATE "UserNineGrid"
    SET cells = jsonb_set(
            jsonb_set(v_cells,
                ARRAY[p_cell_index::text, 'completed'], 'false'::jsonb),
            ARRAY[p_cell_index::text, 'completed_at'], 'null'::jsonb
        ),
        updated_at = NOW()
    WHERE member_id = p_target_user_id;

    -- 刪除格子打卡紀錄（QuestID = nine_grid_cell|{idx}）
    DELETE FROM "DailyLogs"
    WHERE "UserID" = p_target_user_id
      AND "QuestID" = 'nine_grid_cell|' || p_cell_index::text;

    -- 刪除連線加分紀錄並以原子 UPDATE 扣回分數（GREATEST(0, ...) 防止負分）
    IF v_line_score > 0 THEN
        DELETE FROM "DailyLogs" WHERE id = v_line_log_id;

        UPDATE "CharacterStats"
        SET "Score" = GREATEST(0, "Score" - v_line_score)
        WHERE "UserID" = p_target_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'scoreReversed', v_line_score);
END;
$$;

GRANT EXECUTE ON FUNCTION uncomplete_cell_by_captain(TEXT, TEXT, INTEGER) TO service_role;
