-- ============================================================
-- 九宮格單格打卡原子化 RPC
--
-- 對應 CODE_REVIEW_200_USERS.md P1 #1 修補：
--   原本 completeCell（app/actions/nine-grid.ts）為「SELECT cells → JS 改寫 → UPDATE」
--   非原子操作，快速雙擊時可能發生：
--     Req A 讀到 A0 快照 → Req B 讀到 A0 快照 → A 寫入 cells[0,3,6] → B 寫入 cells[0,3,2]
--     B 覆蓋 A 的 cell 6，但 A 已發出 nine_grid_line|cell6 +300（幽靈連線分）
--
-- 解法：把「鎖定 grid row + 計算連線 + 寫回 + 發獎」全部放進單一 RPC：
--   (1) SELECT ... FOR UPDATE 鎖定 UserNineGrid 該 row
--   (2) 以 DailyLogs 做 dedup 二次保險
--   (3) 在同一 transaction 完成 cells JSONB 更新、格子 log、連線 log、CharacterStats.Score 更新
-- ============================================================

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

  -- 連線索引（3格一線：橫3+直3+斜2 = 8條）
  v_lines INTEGER[][] := ARRAY[
    ARRAY[0,1,2], ARRAY[3,4,5], ARRAY[6,7,8],
    ARRAY[0,3,6], ARRAY[1,4,7], ARRAY[2,5,8],
    ARRAY[0,4,8], ARRAY[2,4,6]
  ];
  v_line INTEGER[];
BEGIN
  -- 參數檢查
  IF p_cell_index < 0 OR p_cell_index > 8 THEN
    RETURN jsonb_build_object('success', false, 'error', '格子索引無效');
  END IF;

  -- ── 鎖定 UserNineGrid 該 row（核心原子化保證） ─────────────────────────
  SELECT * INTO v_grid FROM "UserNineGrid"
  WHERE member_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '尚未初始化九宮格，請先選擇旅伴');
  END IF;

  v_cells := v_grid.cells;

  -- cells JSONB 完整性檢查
  IF v_cells IS NULL OR jsonb_array_length(v_cells) <> 9 THEN
    RETURN jsonb_build_object('success', false, 'error', '九宮格資料異常，請重新初始化');
  END IF;

  -- 檢查該格是否已完成
  IF (v_cells->p_cell_index->>'completed')::boolean = true THEN
    RETURN jsonb_build_object('success', false, 'error', '此格已完成，不可重複打卡');
  END IF;

  -- DailyLogs 層 dedup 二次保險（對齊 migration 202604190002）
  SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
  WHERE "UserID" = p_user_id
    AND "QuestID" = 'nine_grid_cell|' || p_cell_index;
  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '此格已入帳，不可重複。');
  END IF;

  -- ── 計算舊連線數（鎖定後的快照） ──────────────────────────────────────
  FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
    IF (v_cells->v_line[1]->>'completed')::boolean = true
      AND (v_cells->v_line[2]->>'completed')::boolean = true
      AND (v_cells->v_line[3]->>'completed')::boolean = true THEN
      v_old_lines := v_old_lines + 1;
    END IF;
  END LOOP;

  -- ── 標記該格完成（ISO 字串以與 app 端 new Date().toISOString() 對齊） ──
  v_now_iso := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_new_cells := jsonb_set(v_cells, ARRAY[p_cell_index::text, 'completed'], 'true'::jsonb);
  v_new_cells := jsonb_set(v_new_cells, ARRAY[p_cell_index::text, 'completed_at'], to_jsonb(v_now_iso));

  -- ── 計算新連線數 ──────────────────────────────────────────────────────
  FOREACH v_line SLICE 1 IN ARRAY v_lines LOOP
    IF (v_new_cells->v_line[1]->>'completed')::boolean = true
      AND (v_new_cells->v_line[2]->>'completed')::boolean = true
      AND (v_new_cells->v_line[3]->>'completed')::boolean = true THEN
      v_new_lines := v_new_lines + 1;
    END IF;
  END LOOP;

  v_new_line_count := v_new_lines - v_old_lines;

  -- ── 寫回 cells JSONB ─────────────────────────────────────────────────
  UPDATE "UserNineGrid"
  SET cells = v_new_cells, updated_at = NOW()
  WHERE member_id = p_user_id;

  -- ── 記錄格子打卡（RewardPoints = 0，僅供審計 & dedup） ──────────────
  INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
  VALUES (NOW(), p_user_id, 'nine_grid_cell|' || p_cell_index, '九宮格格子完成', 0);

  -- ── 如果產生新連線，發連線加分 ────────────────────────────────────────
  --   鎖順序：UserNineGrid → CharacterStats
  --   process_checkin 只鎖 CharacterStats，不鎖 UserNineGrid，故不會與本 RPC deadlock
  IF v_new_line_count > 0 THEN
    v_line_bonus := v_new_line_count * 300;
    v_line_quest_id := 'nine_grid_line|cell' || p_cell_index;

    UPDATE "CharacterStats"
    SET "Score" = COALESCE("Score", 0) + v_line_bonus
    WHERE "UserID" = p_user_id;

    INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
    VALUES (NOW(), p_user_id, v_line_quest_id, '九宮格連線加分（' || v_new_line_count || '條）', v_line_bonus);
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
