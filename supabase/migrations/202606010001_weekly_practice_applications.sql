-- 精進力週任務（wk5）申請審核表
-- 每週限 1 次，二級審核：小隊長初審 → 管理員終審
CREATE TABLE IF NOT EXISTS "WeeklyPracticeApplications" (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_date         TEXT        NOT NULL,           -- YYYY-MM-DD（提交日期）
    user_id            TEXT        NOT NULL REFERENCES "CharacterStats"("UserID") ON DELETE CASCADE,
    user_name          TEXT        NOT NULL,
    team_name          TEXT,
    screenshot_url     TEXT        NOT NULL,           -- 必填截圖
    note               TEXT,
    status             TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','squad_approved','approved','rejected')),
    -- 初審（小隊長）
    squad_review_by    TEXT,
    squad_review_at    TIMESTAMPTZ,
    squad_review_notes TEXT,
    -- 終審（管理員）
    final_review_by    TEXT,
    final_review_at    TIMESTAMPTZ,
    final_review_notes TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpa_user_id   ON "WeeklyPracticeApplications"(user_id);
CREATE INDEX IF NOT EXISTS idx_wpa_status     ON "WeeklyPracticeApplications"(status);
CREATE INDEX IF NOT EXISTS idx_wpa_quest_date ON "WeeklyPracticeApplications"(quest_date);
