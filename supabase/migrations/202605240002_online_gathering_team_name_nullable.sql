-- 放寬 OnlineGatheringApplications.team_name 為 nullable
--
-- 原因:大隊長(IsCommandant)管整個大隊,通常 CharacterStats.TeamName=null,
-- 自送線上凝聚時 team_name 也應該允許 null,由 user_id 識別自審。
-- 與 TempQuestApplications.team_name(本來就 nullable)行為對齊。

ALTER TABLE "OnlineGatheringApplications"
  ALTER COLUMN team_name DROP NOT NULL;
