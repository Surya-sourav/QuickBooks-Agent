CREATE TABLE IF NOT EXISTS qbo_connection (
  id SERIAL PRIMARY KEY,
  realm_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qbo_customers (
  id SERIAL PRIMARY KEY,
  qbo_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  active BOOLEAN,
  last_updated_time TIMESTAMPTZ,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qbo_payments (
  id SERIAL PRIMARY KEY,
  qbo_id TEXT UNIQUE NOT NULL,
  txn_date DATE,
  total_amt NUMERIC,
  customer_ref TEXT,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qbo_journal_entries (
  id SERIAL PRIMARY KEY,
  qbo_id TEXT UNIQUE NOT NULL,
  txn_date DATE,
  total_amt NUMERIC,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qbo_transaction_list_rows (
  id SERIAL PRIMARY KEY,
  report_start_date DATE NOT NULL,
  report_end_date DATE NOT NULL,
  txn_date DATE,
  txn_type TEXT,
  doc_num TEXT,
  name TEXT,
  account TEXT,
  amount NUMERIC,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbo_payments_txn_date ON qbo_payments (txn_date);
CREATE INDEX IF NOT EXISTS idx_qbo_journal_entries_txn_date ON qbo_journal_entries (txn_date);
CREATE INDEX IF NOT EXISTS idx_qbo_transaction_list_txn_date ON qbo_transaction_list_rows (txn_date);
