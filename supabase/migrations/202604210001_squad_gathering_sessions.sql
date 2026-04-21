-- 小組凝聚（實體）wk3_offline 二級審核 + QR 掃碼流程。
-- 新增 SquadGatheringSessions 主檔 + SquadGatheringAttendances 出席表。
-- 既有 SquadGatheringCheckins / sq1-sq4 流程不動，獨立新系統避免語意混淆。
--
-- Status state machine:
--   scheduled       → 管理員排定（尚未凝聚或凝聚進行中）
--   pending_review  → 小隊長送出初審，等待大隊長終審
--   approved        → 大隊長核准，已批次入帳 DailyLogs
--   rejected        → 大隊長退回
--   cancelled       → 管理員於 scheduled 階段取消

CREATE TABLE IF NOT EXISTS "SquadGatheringSessions" (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name                   TEXT NOT NULL,
    gathering_date              DATE NOT NULL,
    status                      TEXT NOT NULL DEFAULT 'scheduled',
    scheduled_by                TEXT NOT NULL,
    captain_submitted_at        TIMESTAMPTZ,
    captain_submitted_by        TEXT,
    commandant_reviewed_at      TIMESTAMPTZ,
    approved_by                 TEXT,
    approved_reward_per_person  INT,
    approved_member_count       INT,
    approved_attendee_count     INT,
    approved_has_commandant     BOOLEAN,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_name, gathering_date),
    CHECK (status IN ('scheduled', 'pending_review', 'approved', 'rejected', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS "SquadGatheringAttendances" (
    id             BIGSERIAL PRIMARY KEY,
    session_id     UUID NOT NULL REFERENCES "SquadGatheringSessions"(id) ON DELETE CASCADE,
    user_id        TEXT NOT NULL,
    user_name      TEXT,
    is_commandant  BOOLEAN NOT NULL DEFAULT FALSE,
    scanned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sga_session ON "SquadGatheringAttendances"(session_id);
CREATE INDEX IF NOT EXISTS idx_sga_user ON "SquadGatheringAttendances"(user_id);
CREATE INDEX IF NOT EXISTS idx_sgs_team_date ON "SquadGatheringSessions"(team_name, gathering_date);
CREATE INDEX IF NOT EXISTS idx_sgs_status ON "SquadGatheringSessions"(status);

-- 共用 trigger function set_updated_at_now() 已於 202604200003 建立
DROP TRIGGER IF EXISTS tg_squad_gathering_sessions_updated_at ON "SquadGatheringSessions";
CREATE TRIGGER tg_squad_gathering_sessions_updated_at
BEFORE UPDATE ON "SquadGatheringSessions"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
