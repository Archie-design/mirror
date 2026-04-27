-- 為 BonusApplications 新增複合索引以加速審核流程查詢
-- 背景：大隊長終審常以 (status, created_at) / (battalion_name, status, created_at) / (squad_name, status, created_at) 過濾並排序
-- 原本只有 status / user_id / quest_id 三個單欄索引，組合查詢會走全表掃描

-- 狀態 + 時間（終審清單主流查詢）
CREATE INDEX IF NOT EXISTS idx_bonusapps_status_created
  ON public."BonusApplications" (status, created_at DESC);

-- 小隊 + 狀態 + 時間（小隊長初審清單）
CREATE INDEX IF NOT EXISTS idx_bonusapps_squad_status_created
  ON public."BonusApplications" (squad_name, status, created_at DESC);

-- 大隊 + 狀態 + 時間（大隊長跨小隊檢視）
CREATE INDEX IF NOT EXISTS idx_bonusapps_battalion_status_created
  ON public."BonusApplications" (battalion_name, status, created_at DESC);

-- 使用者 + 時間（學員個人申請歷史）
CREATE INDEX IF NOT EXISTS idx_bonusapps_user_created
  ON public."BonusApplications" (user_id, created_at DESC);
