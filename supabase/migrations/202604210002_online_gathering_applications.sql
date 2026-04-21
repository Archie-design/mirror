-- 小組凝聚（線上）wk3_online 一級審核流程。
-- 學員提交申請 → 小隊長審核 → 核准後直接入帳（+100 / wk3_online|<week_monday>）
--
-- 規格（§11 / §4.3）：每週 1 次，小隊長初審，無需大隊長終審。
-- 與 wk3_offline 的二級審核（QR 掃碼 + 大隊長終審）刻意分流。
--
-- Status state machine:
--   pending   → 學員提交，等待小隊長審核
--   approved  → 小隊長核准，已入帳 DailyLogs（wk3_online|<week_monday>）
--   rejected  → 小隊長退回，學員可重新提交

CREATE TABLE IF NOT EXISTS "OnlineGatheringApplications" (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               TEXT NOT NULL,
    user_name             TEXT,
    team_name             TEXT NOT NULL,
    week_monday           DATE NOT NULL,                -- logical week anchor（週一 Asia/Taipei）
    status                TEXT NOT NULL DEFAULT 'pending',
    notes                 TEXT,                         -- 學員補充說明（選填）
    squad_review_by       TEXT,
    squad_review_at       TIMESTAMPTZ,
    squad_review_notes    TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- 同一用戶同一週只能有一筆 pending 或 approved（rejected 不擋，允許重送）
CREATE UNIQUE INDEX IF NOT EXISTS uq_oga_user_week_active
ON "OnlineGatheringApplications"(user_id, week_monday)
WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_oga_team_status ON "OnlineGatheringApplications"(team_name, status);
CREATE INDEX IF NOT EXISTS idx_oga_user ON "OnlineGatheringApplications"(user_id);

-- 共用 trigger function set_updated_at_now() 已於 202604200003 建立
DROP TRIGGER IF EXISTS tg_online_gathering_applications_updated_at ON "OnlineGatheringApplications";
CREATE TRIGGER tg_online_gathering_applications_updated_at
BEFORE UPDATE ON "OnlineGatheringApplications"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
