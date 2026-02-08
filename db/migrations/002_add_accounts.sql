CREATE TABLE IF NOT EXISTS qbo_accounts (
  id SERIAL PRIMARY KEY,
  qbo_id TEXT UNIQUE NOT NULL,
  name TEXT,
  account_type TEXT,
  account_sub_type TEXT,
  classification TEXT,
  current_balance NUMERIC,
  active BOOLEAN,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
