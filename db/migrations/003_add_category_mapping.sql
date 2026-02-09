CREATE TABLE IF NOT EXISTS ai_category_account_map (
  category TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  account_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
