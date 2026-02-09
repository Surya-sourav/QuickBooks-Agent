# QuickBooks Analysis Agent (Single Tenant)

Agentic chat app that connects to QuickBooks Online, ingests Payments, Customers, Journal Entries, and TransactionList, stores them in Postgres, and provides LLM-backed insights + Chart.js dashboards.
<img width="1277" height="741" alt="image" src="https://github.com/user-attachments/assets/b8f7ebc4-b642-496c-9cdf-2731ab7311ef" />

<img width="1277" height="741" alt="image" src="https://github.com/user-attachments/assets/8b452c34-df32-4061-9ef7-4f7d8726583d" />


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
- Categories are synced back as **AccountRef** (the transaction “Category” in QBO). Map AI categories to QBO accounts in the Category Mapping widget.
- TransactionList report rows may not include a transaction ID in some tenants; those rows will be skipped during sync.
- TransactionList report is ingested in 6‑month chunks for safety.
- This is a single-tenant starter. If you want multi-tenant, we can add user/org tables and row-level tenancy.
- Bank account sources are derived from the TransactionList `Account` column and summarized in the Accounts Overview widget.
- Use **Auto Map** to generate mappings by account type/subtype (you can edit them afterward).
