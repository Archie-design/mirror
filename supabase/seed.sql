-- ============================================================
-- 大方圓開運親證班 — 測試帳號 Seed
--
-- 執行前請確認 migration 已套用（所有表格已存在）。
-- 所有 INSERT 使用 ON CONFLICT DO NOTHING，可重複執行。
--
-- 測試帳號說明：
--   test-a  一般學員，手機末三碼: 001
--   test-b  劇組長（IsCaptain），手機末三碼: 002
--   test-c  大隊長（IsCommandant），手機末三碼: 003
--
-- 課程報名系統以 UserID ILIKE '%XXX' 比對手機末三碼，
-- 測試時輸入對應的 3 位數字即可找到帳號。
-- ============================================================

-- ── 1. TeamSettings（需先於 CharacterStats 存在）──
INSERT INTO public."TeamSettings" ("team_name", "team_coins", "inventory")
VALUES ('烏龜劇組', 0, '[]'::jsonb)
ON CONFLICT ("team_name") DO NOTHING;

-- ── 2. Rosters（學員名冊預先登記）──
INSERT INTO public."Rosters" ("email", "name", "birthday", "squad_name", "team_name", "is_captain", "is_commandant")
VALUES
    ('test-a@example.com', '測試甲', '1990-01-01', '第一發行商', '烏龜劇組', false, false),
    ('test-b@example.com', '測試乙', '1990-02-02', '第一發行商', '烏龜劇組', true,  false),
    ('test-c@example.com', '測試丙', '1990-03-03', '第一發行商', NULL,       false, true)
ON CONFLICT ("email") DO NOTHING;

-- ── 3. CharacterStats（測試角色，UserID 末3碼分別為 001/002/003）──
INSERT INTO public."CharacterStats"
    ("UserID", "Name", "Email", "Level", "Exp",
     "HP", "MaxHP", "CurrentQ", "CurrentR",
     "SquadName", "TeamName", "IsCaptain", "IsCommandant", "IsGM",
     "Birthday", "Streak")
VALUES
    -- 一般學員（Lv1，空白起始）
    ('test-user-001', '測試甲', 'test-a@example.com',
     1, 0,
     100, 100, 0, 0,
     '第一發行商', '烏龜劇組', false, false, false,
     '1990-01-01', 0),

    -- 劇組長（Lv5，有一定資源）
    ('test-user-002', '測試乙', 'test-b@example.com',
     5, 5000,
     150, 150, 2, -1,
     '第一發行商', '烏龜劇組', true, false, false,
     '1990-02-02', 7),

    -- 大隊長（Lv10，高等級測試）
    ('test-user-003', '測試丙', 'test-c@example.com',
     10, 15000,
     200, 200, -3, 2,
     '第一發行商', NULL, false, true, false,
     '1990-03-03', 21)
ON CONFLICT ("UserID") DO NOTHING;

-- ── 4. SystemSettings 預設值 ──
INSERT INTO public."SystemSettings" ("SettingName", "Value")
VALUES
    ('VolunteerPassword', '1234'),
    ('WorldState',        'normal'),
    ('WorldStateMsg',     '【世俗】眾生修行平平，三界維持恐怖平衡。')
ON CONFLICT ("SettingName") DO NOTHING;
