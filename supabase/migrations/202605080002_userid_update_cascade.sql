-- 讓 CharacterStats.UserID 修改時，DailyLogs.UserID 自動跟著更新。
--
-- 背景：
--   管理員需能修改學員手機號（= UserID）。原本 FK 只有 ON DELETE CASCADE，
--   修改 UserID 會違反 FK 約束。改為 ON UPDATE CASCADE 後可原子完成。

ALTER TABLE "DailyLogs" DROP CONSTRAINT "DailyLogs_UserID_fkey";

ALTER TABLE "DailyLogs"
  ADD CONSTRAINT "DailyLogs_UserID_fkey"
  FOREIGN KEY ("UserID") REFERENCES "CharacterStats"("UserID")
  ON UPDATE CASCADE ON DELETE CASCADE;
