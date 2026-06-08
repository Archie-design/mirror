-- 體系長（李姵琦）專屬實體定聚支援
--
-- 背景：
--   李姵琦是「體系長」，地位在大隊長之上，但系統內 TeamName/SquadName 皆空、
--   IsCommandant=false → 無法掃碼、也無法被補登，實體定聚紀錄掛零。
--
-- 規則（已與用戶確認）：
--   - 真實 QR 掃碼；5 人（含她）一起定聚即成立
--   - 成立時每位出席者各得 4000（比照大隊長到場：base 3000 + bonus 1000）
--   - 若該場另有真大隊長到場，不重複計算（commandant bonus 只算一次）
--
-- 作法：
--   1. 新增 IsSystemHead 旗標
--   2. 李姵琦設為體系長，並給專屬隊名「體系長」讓既有 session/掃碼/入帳機制可運作
--      （reward 由程式端針對「體系長」隊名固定為 4000，不套全到加成）

ALTER TABLE "CharacterStats"
    ADD COLUMN IF NOT EXISTS "IsSystemHead" BOOLEAN DEFAULT false;

UPDATE "CharacterStats"
SET "IsSystemHead" = true,
    "TeamName"     = '體系長'
WHERE "UserID" = '929636587';  -- 李姵琦
