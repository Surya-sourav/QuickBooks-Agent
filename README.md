# QuickBooks Analysis Agent (Single Tenant)

Single-tenant agentic chat app that connects to QuickBooks Online, ingests Payments, Customers, Journal Entries, and TransactionList, stores them in Postgres, and provides LLM-backed insights + Chart.js dashboards.

## What’s Included
- Node.js + TypeScript backend (Express)
- Postgres storage
- QuickBooks OAuth 2.0 connection + ingestion
- Cerebras-backed analysis agent (OpenAI-compatible API)
- Simple dashboard + chat UI (Chart.js)
- Transactions dashboard with AI categorization + sync back to QuickBooks (Class)

## Setup

### 1) Install deps
```bash
npm install
```

### 2) Configure environment
Create a `.env` with:
```bash
DATABASE_URL=postgres://user:pass@localhost:5432/qbo_agent
PORT=3000

QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
QBO_REDIRECT_URI=http://localhost:3000/api/auth/callback
QBO_ENV=sandbox
QBO_SCOPES=com.intuit.quickbooks.accounting
QBO_MINOR_VERSION=70
DATA_START_DATE=2023-01-01
DATA_END_DATE=2026-01-31

AI_TRANSACTION_CATEGORIES=Income,COGS,Payroll,Rent,Utilities,Marketing,Travel,Software,Insurance,Repairs,Bank Fees,Taxes,Other

CEREBRAS_API_KEY=...
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
CEREBRAS_MODEL=zai-glm-4.7
```

### 3) Initialize database
```bash
npm run db:init
```

### 4) Run
```bash
npm run dev
```

Open `http://localhost:3000`.

## Usage
1) Click **Connect QuickBooks** to authorize the app.
2) Click **Sync Data** to ingest QuickBooks data for the configured range.
3) Ask questions in the chat (e.g., “What are payment trends by month?”).
4) Use **Remove Connection** to disconnect. You can optionally purge synced data.
5) Use **AI Categorize** to label transactions and **Sync Categories to QBO** to write back Classes.

## Migrations
If you already ran `db:init`, run the latest migration once:
```bash
npm run db:migrate
```

## Notes
- Categories are synced back as **Classes**. Ensure Class tracking is enabled in QuickBooks if you want to see them in reports.
- TransactionList report rows may not include a transaction ID in some tenants; those rows will be skipped during sync.
- TransactionList report is ingested in 6‑month chunks for safety.
- This is a single-tenant starter. If you want multi-tenant, we can add user/org tables and row-level tenancy.
- Bank account sources are derived from the TransactionList `Account` column and summarized in the Accounts Overview widget.
