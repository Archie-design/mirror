-- 修正 SquadGatheringSessions 唯一鍵：改為「僅對有效狀態唯一」
--
-- 背景：
--   原本 UNIQUE (team_name, gathering_date) 不分狀態，導致同隊同日只要有一筆
--   已取消(cancelled)/已退回(rejected) 的殘留紀錄，就無法再排定新凝聚
--   （大隊長會看到「該小隊當日已排定凝聚」）。
--
-- 修法：
--   移除原 table-level UNIQUE 約束，改建「部分唯一索引」——
--   只對有效狀態(scheduled / pending_review / approved)強制唯一。
--   cancelled / rejected 不納入唯一性，因此不再擋重排，
--   但同隊同日仍只能有一筆有效凝聚。

-- 1) 動態找出 (team_name, gathering_date) 的 2 欄唯一約束並移除（約束名為自動產生）
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = '"SquadGatheringSessions"'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 2;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "SquadGatheringSessions" DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- 2) 建立部分唯一索引：僅有效狀態唯一
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sgs_active_team_date
  ON "SquadGatheringSessions"(team_name, gathering_date)
  WHERE status NOT IN ('cancelled', 'rejected');
