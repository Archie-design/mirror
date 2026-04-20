-- ============================================================
-- 人生大戲分享（wk4_small / wk4_large）計分規則 server 層強制
--
-- 對應 CODE_REVIEW_200_USERS.md P1 #2 + #3 修補：
--   1. 同週需完成至少 1 格九宮格才能打卡（原僅前端驗證，可被繞過）
--   2. 同類型 wk4 每週僅能入帳一次（原 RPC 對 wk4 無任何 dedup）
--
-- 對應 app 端 business rule: components/Tabs/NineGridTab.tsx hasCompletedCellThisWeek
-- ============================================================

CREATE OR REPLACE FUNCTION process_checkin(
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
  v_user         RECORD;
  v_dup_count    INTEGER;
  v_cap_count    INTEGER;
  v_new_score    INTEGER;
  v_monday       TIMESTAMPTZ;
  v_quest_prefix TEXT;
  v_cell_count   INTEGER;

  v_basic_ids    TEXT[] := ARRAY['d1','d2','d3','d4','d5','d6','d7','d8'];
  v_weighted_ids TEXT[] := ARRAY['p1','p2','p3','p4','p5'];
  v_diet_ids     TEXT[] := ARRAY['diet_veg','diet_seafood'];
BEGIN
  -- 鎖定使用者列（同時作為同 user concurrent wk4 請求的序列化點）
  SELECT * INTO v_user FROM "CharacterStats" WHERE "UserID" = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '查無此用戶: ' || p_user_id);
  END IF;

  -- ── 基本定課（d1–d8）：每日上限 3 項，每種各 1 次 ───────────────────
  IF p_quest_id = ANY(v_basic_ids) THEN
    SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = p_quest_id
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此定課今日已完成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_basic_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_cap_count >= 3 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日基本定課已達上限（3 項）。');
    END IF;

  -- ── 加權定課（p1–p5）：每日上限 3 項，與基本定課各自獨立 ────────────
  ELSIF p_quest_id = ANY(v_weighted_ids) THEN
    SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = p_quest_id
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此定課今日已完成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_weighted_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_cap_count >= 3 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日加權定課已達上限（3 項）。');
    END IF;

  -- ── 破曉打拳（p1_dawn）：需同日已完成 p1，不佔用名額 ───────────────
  ELSIF p_quest_id = 'p1_dawn' THEN
    SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = 'p1'
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '需先完成打拳（p1）才能記錄破曉打拳加成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = 'p1_dawn'
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_cap_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日破曉打拳加成已記錄。');
    END IF;

  -- ── 飲控（diet_veg / diet_seafood）：每日擇一，不佔用定課名額 ─────
  ELSIF p_quest_id = ANY(v_diet_ids) THEN
    SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_diet_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 day')::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日飲控已記錄，每日只能擇一。');
    END IF;

  -- ── 九宮格單格（nine_grid_cell|N）：全局唯一，同格只能入帳一次 ─────
  ELSIF p_quest_id LIKE 'nine_grid_cell|%' THEN
    SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = p_quest_id;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此格已入帳，不可重複。');
    END IF;

  -- ── 人生大戲分享（wk4_small|YYYY-MM-DD / wk4_large|YYYY-MM-DD） ────
  --    條件 1: 本週至少完成 1 格九宮格
  --    條件 2: 本週同類型僅能入帳一次
  ELSIF p_quest_id LIKE 'wk4_small|%' OR p_quest_id LIKE 'wk4_large|%' THEN
    v_quest_prefix := split_part(p_quest_id, '|', 1);
    -- 本週一 00:00 Asia/Taipei 轉為 UTC timestamptz 以便與 UTC 儲存時間比對
    v_monday := date_trunc('week', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';

    -- 條件 1: 查 UserNineGrid.cells，本週內須有至少 1 格 completed
    SELECT COUNT(*) INTO v_cell_count
    FROM "UserNineGrid" g,
         jsonb_array_elements(g.cells) AS cell
    WHERE g.member_id = p_user_id
      AND (cell->>'completed')::boolean = true
      AND cell->>'completed_at' IS NOT NULL
      AND (cell->>'completed_at')::timestamptz >= v_monday;

    IF v_cell_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '本週尚未完成任何九宮格格子，無法記錄分享。');
    END IF;

    -- 條件 2: 本週同類型 wk4 僅能入帳一次
    SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id
      AND "QuestID" LIKE v_quest_prefix || '|%'
      AND "Timestamp" >= v_monday;

    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '本週此分享已記錄。');
    END IF;

  END IF;
  -- 其他任務（wk1/wk2/wk3/o*/連線獎勵等）：無額外限制

  -- ── 計算新分數並更新 ──────────────────────────────────────────────────
  v_new_score := COALESCE(v_user."Score", 0) + p_quest_reward;

  UPDATE "CharacterStats" SET
    "Score"       = v_new_score,
    "LastCheckIn" = p_logical_today
  WHERE "UserID" = p_user_id;

  INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
  VALUES (NOW(), p_user_id, p_quest_id, p_quest_title, p_quest_reward);

  SELECT * INTO v_user FROM "CharacterStats" WHERE "UserID" = p_user_id;
  RETURN jsonb_build_object('success', true, 'rewardCapped', false, 'user', row_to_json(v_user));

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
