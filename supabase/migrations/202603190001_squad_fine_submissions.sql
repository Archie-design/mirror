-- 小隊批次上繳大會紀錄表
CREATE TABLE IF NOT EXISTS "SquadFineSubmissions" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  squad_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  submitted_at DATE NOT NULL,
  recorded_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_squad_fine_submissions_squad ON "SquadFineSubmissions" (squad_name);
