-- Rosters 主鍵從 email 改為 phone（標準化後的 9 位手機）。
-- 開營前無正式資料，直接清表重建；舊測試 seed 會被丟棄。

BEGIN;

TRUNCATE TABLE public."Rosters";

ALTER TABLE public."Rosters" DROP CONSTRAINT IF EXISTS "Rosters_pkey";
ALTER TABLE public."Rosters" DROP COLUMN IF EXISTS "email";
ALTER TABLE public."Rosters" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE public."Rosters" ADD CONSTRAINT "Rosters_pkey" PRIMARY KEY ("phone");

CREATE INDEX IF NOT EXISTS "idx_rosters_phone" ON public."Rosters"("phone");

COMMIT;
