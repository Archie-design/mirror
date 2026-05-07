-- 臨時加碼任務二級審核制（202605070001）
--
-- 新建 TempQuestApplications 表：學員提交截圖申請 →
-- 小隊長初審（pending → squad_approved / rejected）→
-- 管理員終審（squad_approved → approved / rejected，通過後入帳分數）

CREATE TABLE IF NOT EXISTS "TempQuestApplications" (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_id           TEXT        NOT NULL,          -- temp_XXXXX
    quest_date         TEXT        NOT NULL,          -- YYYY-MM-DD（邏輯日期）
    user_id            TEXT        NOT NULL,
    user_name          TEXT        NOT NULL,
    team_name          TEXT,                          -- 小隊名稱，供隊長篩選
    screenshot_url     TEXT,                          -- 截圖佐證 URL（選填）
    note               TEXT,                          -- 學員備註
    status             TEXT        NOT NULL DEFAULT 'pending',
    squad_review_by    TEXT,
    squad_review_at    TIMESTAMPTZ,
    squad_review_notes TEXT,
    final_review_by    TEXT,
    final_review_at    TIMESTAMPTZ,
    final_review_notes TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "TempQuestApplications_user_id_idx"
    ON "TempQuestApplications"(user_id);

CREATE INDEX IF NOT EXISTS "TempQuestApplications_team_status_idx"
    ON "TempQuestApplications"(team_name, status);

ALTER TABLE "TempQuestApplications" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON "TempQuestApplications"
    FOR ALL TO service_role USING (true) WITH CHECK (true);
