ALTER TABLE qbo_transaction_list_rows
  ADD COLUMN IF NOT EXISTS txn_id TEXT,
  ADD COLUMN IF NOT EXISTS ai_category TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_status TEXT,
  ADD COLUMN IF NOT EXISTS qb_class_id TEXT,
  ADD COLUMN IF NOT EXISTS qb_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS qb_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_qbo_transaction_list_txn_id ON qbo_transaction_list_rows (txn_id);
CREATE INDEX IF NOT EXISTS idx_qbo_transaction_list_ai_category ON qbo_transaction_list_rows (ai_category);
