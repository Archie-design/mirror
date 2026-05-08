-- 新增 season_week_start() 並更新 process_checkin 中 wk4 互斥邊界
--
-- 目的：
--   賽季第 1 週為 2026-05-10 (週日) ~ 2026-05-17 (週日) 共 8 天；
--   第 2 週起回到標準週一錨點。
--
-- season_week_start(timestamptz)：
--   傳入時間 → 回傳該時間所屬賽季週的起始 timestamptz（Asia/Taipei）
--   - 5/10 ~ 5/17 期間 → 回傳 2026-05-10 00:00 +08
--   - 其餘 → 回傳該日所屬 ISO 週的週一 00:00 +08
--
-- process_checkin 中 wk4_small / wk4_large 互斥區塊原本用 date_trunc('week', ...)，
-- 改為 season_week_start(now())，第 1 週才能正確視為 8 天同一桶。

CREATE OR REPLACE FUNCTION season_week_start(p_ts timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_d date := (p_ts AT TIME ZONE 'Asia/Taipei')::date;
BEGIN
    IF v_d >= DATE '2026-05-10' AND v_d < DATE '2026-05-18' THEN
        RETURN '2026-05-10 00:00:00+08'::timestamptz;
    END IF;
    RETURN (date_trunc('week', p_ts AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei');
END
$$;

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
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - 1)::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此定課今日已完成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_basic_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - 1)::text
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
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - 1)::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '此定課今日已完成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = ANY(v_weighted_ids)
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - 1)::text
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
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - 1)::text
          END = ANY(ARRAY[
            p_logical_today,
            (TO_DATE(p_logical_today, 'YYYY-MM-DD') - 1)::text
          ]);
    IF v_dup_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '需先完成打拳（p1）才能記錄破曉打拳加成。');
    END IF;
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id AND "QuestID" = 'p1_dawn'
      AND CASE
            WHEN EXTRACT(HOUR FROM "Timestamp" AT TIME ZONE 'Asia/Taipei') >= 12
            THEN (date("Timestamp" AT TIME ZONE 'Asia/Taipei'))::text
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - 1)::text
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
            ELSE (date("Timestamp" AT TIME ZONE 'Asia/Taipei') - 1)::text
          END = p_logical_today;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '今日飲控已記錄，每日只能擇一。');
    END IF;

  -- ── 人生大戲分享（wk4_small / wk4_large）：當週擇一 + 須完成 ≥1 格
  ELSIF p_quest_id LIKE 'wk4_small|%' OR p_quest_id LIKE 'wk4_large|%' THEN
    -- 改用 season_week_start 取代 date_trunc('week', ...)，使第 1 週橫跨 8 天
    v_monday := season_week_start(now());
    SELECT COUNT(*) INTO v_dup_count
    FROM "UserNineGrid", jsonb_array_elements(cells) AS cell
    WHERE member_id = p_user_id
      AND (cell->>'completed')::boolean = true
      AND (cell->>'completed_at')::timestamptz >= v_monday;
    IF v_dup_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '當週尚未完成任何九宮格格子。');
    END IF;

    -- 互斥：同週內 wk4_small 與 wk4_large 任一已存在皆拒絕
    SELECT COUNT(*) INTO v_cap_count FROM "DailyLogs"
    WHERE "UserID" = p_user_id
      AND ("QuestID" LIKE 'wk4_small|%' OR "QuestID" LIKE 'wk4_large|%')
      AND "Timestamp" >= v_monday;
    IF v_cap_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '本週人生大戲分享已記錄（小群與大群擇一）。');
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

  SELECT * INTO v_user FROM "CharacterStats" WHERE "UserID" = p_user_id;

  RETURN jsonb_build_object('success', true, 'newScore', v_new_score, 'rewardCapped', false, 'user', row_to_json(v_user));

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
