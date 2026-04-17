-- ============================================================
-- 親證班新計分系統 migration
-- 1. CharacterStats 欄位清理：Exp → Score，移除 Level/Fines/Dice 等
-- 2. 重寫 process_checkin RPC：支援 d/p/diet/dawn 新任務架構
-- ============================================================

-- ── CharacterStats 欄位更新 ─────────────────────────────────────────────
-- 將 Exp 更名為 Score（分數制，不再有等級換算）
ALTER TABLE "CharacterStats" RENAME COLUMN "Exp" TO "Score";

-- 移除等級、罰款、舊每日進度計數等欄位
ALTER TABLE "CharacterStats"
  DROP COLUMN IF EXISTS "Level",
  DROP COLUMN IF EXISTS "TotalFines",
  DROP COLUMN IF EXISTS "FinePaid",
  DROP COLUMN IF EXISTS "CurrentQ",
  DROP COLUMN IF EXISTS "CurrentR",
  DROP COLUMN IF EXISTS "EnergyDice",
  DROP COLUMN IF EXISTS "GoldenDice",
  DROP COLUMN IF EXISTS "Inventory",
  DROP COLUMN IF EXISTS "InitialFortunes";

-- ── 重寫 process_checkin ────────────────────────────────────────────────
-- 新參數列表：移除 p_new_level 與 p_flex_quest_ids（改為 SQL 內建靜態陣列）
DROP FUNCTION IF EXISTS process_checkin(TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT[],TEXT);
DROP FUNCTION IF EXISTS process_checkin(TEXT,TEXT,TEXT,INTEGER,TEXT);

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
  v_user      RECORD;
  v_dup_count INTEGER;
  v_cap_count INTEGER;
  v_new_score INTEGER;

  -- 基本定課 IDs（d1–d8，每日上限 3 項，獨立計算）
  v_basic_ids    TEXT[] := ARRAY['d1','d2','d3','d4','d5','d6','d7','d8'];
  -- 加權定課 IDs（p1–p5，每日上限 3 項，與基本定課各自獨立）
  v_weighted_ids TEXT[] := ARRAY['p1','p2','p3','p4','p5'];
  -- 飲控 IDs（每日擇一，不佔用定課名額）
  v_diet_ids     TEXT[] := ARRAY['diet_veg','diet_seafood'];
BEGIN
  -- 鎖定使用者列
  SELECT * INTO v_user FROM "CharacterStats" WHERE "UserID" = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '查無此用戶: ' || p_user_id);
  END IF;

  -- ── 基本定課（d1–d8）：每日上限 3 項，每種各 1 次 ───────────────────
  IF p_quest_id = ANY(v_basic_ids) THEN
    -- 重複檢查（同種當日最多 1 次）
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
    -- 每日上限 3 項（基本定課獨立計算）
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
    -- 重複檢查
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
    -- 每日上限 3 項（加權定課獨立計算）
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
    -- 確認當日已完成 p1
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
    -- 破曉打拳每日最多 1 次
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

  END IF;
  -- 其他任務（每週任務、九宮格、一次性任務等）：
  -- 無每日上限，重複驗證由呼叫端自行處理

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
