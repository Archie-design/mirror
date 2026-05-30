-- 實體凝聚排程新增「凝聚主題」欄位
-- 大隊長排定凝聚時可填入主題，顯示於排程列表與審核頁
ALTER TABLE "SquadGatheringSessions"
  ADD COLUMN IF NOT EXISTS gathering_theme TEXT;
