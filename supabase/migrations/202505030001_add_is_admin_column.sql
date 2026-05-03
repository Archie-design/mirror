ALTER TABLE "CharacterStats"
  ADD COLUMN IF NOT EXISTS "IsAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_characterstats_isadmin
  ON "CharacterStats" ("IsAdmin")
  WHERE "IsAdmin" = true;
