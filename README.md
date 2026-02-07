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

## Notes
- TransactionList report is ingested in 6‑month chunks for safety.
- This is a single-tenant starter. If you want multi-tenant, we can add user/org tables and row-level tenancy.
