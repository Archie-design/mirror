-- ============================================================
-- 效能優化與安全性強化
-- 1. DailyLogs 複合索引（加速 process_checkin RPC 的 COUNT 查詢）
-- 2. 收緊 CharacterStats / DailyLogs RLS（移除 anon 直接寫入）
--    所有寫入改由 server action 透過 service role key 執行
-- ============================================================

-- ── 1. 複合索引 ────────────────────────────────────────────────────────────
-- (UserID, Timestamp DESC) 覆蓋 process_checkin 的所有 COUNT 查詢：
--   WHERE "UserID" = $1 AND "QuestID" = ANY(...) AND date(Timestamp) = today
CREATE INDEX IF NOT EXISTS idx_dailylogs_userid_timestamp
    ON public."DailyLogs"("UserID", "Timestamp" DESC);

-- ── 2. CharacterStats — 移除 anon UPDATE ──────────────────────────────────
-- 原 policy 允許任意 anon client 更新任何人的分數；
-- 所有 CharacterStats 寫入現在統一走 server action（service role bypass RLS）
DROP POLICY IF EXISTS "Allow public update on CharacterStats" ON public."CharacterStats";

-- ── 3. DailyLogs — 移除 anon DELETE ──────────────────────────────────────
-- 原 policy 允許任意 anon client 刪除任何人的打卡記錄；
-- 回溯打卡 (undoCheckIn) 已改為 server action
DROP POLICY IF EXISTS "Allow public delete on DailyLogs" ON public."DailyLogs";
