-- 臨時加碼任務日期範圍：允許管理員設定任務有效日期區間
-- start_date / end_date 為 NULL 表示無限制（向下相容）
ALTER TABLE temporaryquests
  ADD COLUMN IF NOT EXISTS start_date TEXT,
  ADD COLUMN IF NOT EXISTS end_date   TEXT;
