-- 修復 process_checkin RPC 成功回傳缺少 user 欄位
-- 背景：202604220002 在替換 RPC 時，success RETURN 只回傳 newScore，
-- 遺漏了 user 物件。page.tsx:336 判斷 res.success && res.user，
-- 導致成功打卡被誤判為失敗並顯示「記錄失敗」modal。
-- 同時修正：改在 UPDATE 後重新 SELECT v_user，回傳最新分數而非舊值。

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

  v_basic_ids    TEXT[] := ARRAY['d1','d2','d3','d4','d5','d6','d7','d8'];
  v_weighted_ids TEXT[] := ARRAY['p1','p2','p3','p4','p5'];
  v_diet_ids     TEXT[] := ARRAY['diet_veg','diet_seafood'];
BEGIN
  SELECT * INTO v_user FROM "CharacterStats" WHERE "UserID" = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '查無此用戶: ' || p_user_id);
  END IF;

  -- ── 基本定課（d1–d8）
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

  -- ── 加權定課（p1–p5）
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

  -- ── 破曉打拳（p1_dawn）
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

  -- ── 飲控
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

  -- ── 人生大戲分享（wk4_small / wk4_large）：須當週完成 ≥1 格 + 週內 dedup
  ELSIF p_quest_id LIKE 'wk4_small|%' OR p_quest_id LIKE 'wk4_large|%' THEN
    v_monday := (date_trunc('week', (now() AT TIME ZONE 'Asia/Taipei')::timestamp) AT TIME ZONE 'Asia/Taipei');
    SELECT COUNT(*) INTO v_dup_count
    FROM "UserNineGrid", jsonb_array_elements(cells) AS cell
    WHERE member_id = p_user_id
      AND (cell->>'completed')::boolean = true
      AND (cell->>'completed_at')::timestamptz >= v_monday;
    IF v_dup_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '當週尚未完成任何九宮格格子。');
    END IF;

    v_quest_prefix := split_part(p_quest_id, '|', 1);
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id
      AND "QuestID" LIKE v_quest_prefix || '|%'
      AND "Timestamp" >= v_monday;
    IF v_cap_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '本週此分享已記錄。');
    END IF;

  -- ── 臨時加碼任務（temp_TIMESTAMP|YYYY-MM-DD）：同 questId 當日只能入帳 1 次 ──
  ELSIF p_quest_id LIKE 'temp\_%' ESCAPE '\' THEN
    SELECT COUNT(*) INTO v_dup_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = p_quest_id;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此臨時任務今日已完成。');
    END IF;
  END IF;

  -- ── 計算新分數並更新 ──
  v_new_score := COALESCE(v_user."Score", 0) + p_quest_reward;

  UPDATE "CharacterStats" SET
    "Score"       = v_new_score,
    "LastCheckIn" = p_logical_today
  WHERE "UserID" = p_user_id;

  INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
  VALUES (NOW(), p_user_id, p_quest_id, p_quest_title, p_quest_reward);

  -- UPDATE 後重新讀取，回傳最新 CharacterStats（含更新後分數）
  SELECT * INTO v_user FROM "CharacterStats" WHERE "UserID" = p_user_id;

  RETURN jsonb_build_object('success', true, 'newScore', v_new_score, 'rewardCapped', false, 'user', row_to_json(v_user));

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
