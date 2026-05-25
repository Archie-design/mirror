-- 為實體小組凝聚補報功能新增兩欄
--
-- 用途:管理員可事後補報凝聚(QR 沒成功掃 / 隊長忘了送審 等),
-- 直接以 status='approved' 入庫,並上傳截圖作佐證。
-- 兩欄都僅補報流程會填,正常流程留 NULL。

ALTER TABLE "SquadGatheringSessions"
  ADD COLUMN IF NOT EXISTS evidence_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS backfilled_by_admin TEXT;
