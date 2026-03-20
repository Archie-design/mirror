CREATE TABLE IF NOT EXISTS "Achievements" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "CharacterStats"("UserID") ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON "Achievements" (user_id);
