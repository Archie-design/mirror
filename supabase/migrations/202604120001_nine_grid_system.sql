-- 九宮格公版模板系統
-- 每種旅伴（五運）一份公版模板，管理員可編輯

CREATE TABLE IF NOT EXISTS NineGridTemplates (
  id SERIAL PRIMARY KEY,
  companion_type TEXT NOT NULL UNIQUE, -- '事業運' | '財富運' | '情感運' | '家庭運' | '體能運'
  cells JSONB NOT NULL DEFAULT '[]',   -- array[9] of { label: string, description: string }
  cell_score INTEGER NOT NULL DEFAULT 100, -- 每格得分（暫定100，管理員可調整）
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入5種旅伴的預設空模板
INSERT INTO NineGridTemplates (companion_type, cells, cell_score) VALUES
  ('事業運', '[
    {"label": "任務1", "description": ""},
    {"label": "任務2", "description": ""},
    {"label": "任務3", "description": ""},
    {"label": "任務4", "description": ""},
    {"label": "任務5", "description": ""},
    {"label": "任務6", "description": ""},
    {"label": "任務7", "description": ""},
    {"label": "任務8", "description": ""},
    {"label": "任務9", "description": ""}
  ]', 100),
  ('財富運', '[
    {"label": "任務1", "description": ""},
    {"label": "任務2", "description": ""},
    {"label": "任務3", "description": ""},
    {"label": "任務4", "description": ""},
    {"label": "任務5", "description": ""},
    {"label": "任務6", "description": ""},
    {"label": "任務7", "description": ""},
    {"label": "任務8", "description": ""},
    {"label": "任務9", "description": ""}
  ]', 100),
  ('情感運', '[
    {"label": "任務1", "description": ""},
    {"label": "任務2", "description": ""},
    {"label": "任務3", "description": ""},
    {"label": "任務4", "description": ""},
    {"label": "任務5", "description": ""},
    {"label": "任務6", "description": ""},
    {"label": "任務7", "description": ""},
    {"label": "任務8", "description": ""},
    {"label": "任務9", "description": ""}
  ]', 100),
  ('家庭運', '[
    {"label": "任務1", "description": ""},
    {"label": "任務2", "description": ""},
    {"label": "任務3", "description": ""},
    {"label": "任務4", "description": ""},
    {"label": "任務5", "description": ""},
    {"label": "任務6", "description": ""},
    {"label": "任務7", "description": ""},
    {"label": "任務8", "description": ""},
    {"label": "任務9", "description": ""}
  ]', 100),
  ('體能運', '[
    {"label": "任務1", "description": ""},
    {"label": "任務2", "description": ""},
    {"label": "任務3", "description": ""},
    {"label": "任務4", "description": ""},
    {"label": "任務5", "description": ""},
    {"label": "任務6", "description": ""},
    {"label": "任務7", "description": ""},
    {"label": "任務8", "description": ""},
    {"label": "任務9", "description": ""}
  ]', 100)
ON CONFLICT (companion_type) DO NOTHING;

-- 每位學員的個人九宮格（從公版模板複製後可打卡）
CREATE TABLE IF NOT EXISTS UserNineGrid (
  id SERIAL PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE, -- references CharacterStats(UserID)
  companion_type TEXT NOT NULL,
  cells JSONB NOT NULL DEFAULT '[]',
  -- cells 格式: array[9] of {
  --   label: string,
  --   description: string,
  --   completed: boolean,
  --   completed_at: string | null
  -- }
  cell_score INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_nine_grid_member ON UserNineGrid(member_id);
