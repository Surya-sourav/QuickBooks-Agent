import { config } from "../config.js";
import { query } from "../db.js";

type TxnRow = {
  id: number;
  txn_date: string | null;
  txn_type: string | null;
  name: string | null;
  account: string | null;
  amount: number | null;
  doc_num: string | null;
};

type Categorization = {
  id: number;
  category: string;
  confidence?: number;
};

const safeJsonParse = (content: string) => {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : content.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const arrayStart = candidate.indexOf("[");
    const arrayEnd = candidate.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(candidate.slice(arrayStart, arrayEnd + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
};

const normalizeCategory = (category: string, allowed: string[]) => {
  const match = allowed.find((c) => c.toLowerCase() === category.toLowerCase());
  return match ?? "Other";
};

const heuristicCategory = (row: TxnRow, allowed: string[]) => {
  const name = (row.name ?? "").toLowerCase();
  const type = (row.txn_type ?? "").toLowerCase();

  const rules: Array<[RegExp, string]> = [
    [/(payroll|salary|gusto|paychex|adp)/i, "Payroll"],
    [/(rent|lease)/i, "Rent"],
    [/(electric|gas|water|utility|utilities|internet|comcast|verizon|at&t)/i, "Utilities"],
    [/(marketing|ads|adwords|facebook|google ads|linkedin)/i, "Marketing"],
    [/(uber|lyft|airlines|airbnb|hotel|travel|expedia)/i, "Travel"],
    [/(software|saas|aws|azure|gcp|github|gitlab|slack|notion|zoom)/i, "Software"],
    [/(insurance)/i, "Insurance"],
    [/(repair|maintenance)/i, "Repairs"],
    [/(bank fee|fee|service charge)/i, "Bank Fees"],
    [/(tax|irs|vat)/i, "Taxes"],
    [/(inventory|cogs|cost of goods)/i, "COGS"]
  ];

  for (const [pattern, category] of rules) {
    if (pattern.test(name)) {
      return normalizeCategory(category, allowed);
    }
  }

  if (/(invoice|salesreceipt|payment|deposit)/i.test(type)) {
    return normalizeCategory("Income", allowed);
  }

  return normalizeCategory("Other", allowed);
};

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const categorizeTransactions = async (
  limit = 200,
  options?: { onProgress?: (state: { total: number; processed: number; categorized: number; failed: number }) => void }
) => {
  const pendingRes = await query<TxnRow>(
    `SELECT id, txn_date, txn_type, name, account, amount, doc_num
     FROM qbo_transaction_list_rows
     WHERE ai_category IS NULL OR ai_status IS DISTINCT FROM 'categorized'
     ORDER BY txn_date DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  const rows = pendingRes.rows;
  if (rows.length === 0) {
    return { processed: 0, categorized: 0, failed: 0 };
  }

  const categories = config.ai.transactionCategories;
  const batches = chunkArray(rows, 30);
  let categorized = 0;
  let processed = 0;
  let failed = 0;

  for (const batch of batches) {
    const batchIds = batch.map((row) => row.id);
    await query(
      `UPDATE qbo_transaction_list_rows
       SET ai_status='categorizing', updated_at=NOW()
       WHERE id = ANY($1::int[])`,
      [batchIds]
    );

    const prompt = {
      categories,
      transactions: batch.map((row) => ({
        id: row.id,
        name: row.name ?? ""
      }))
    };

    const payload = {
      model: config.cerebras.model,
      messages: [
        {
          role: "system",
          content:
            "You are a bookkeeping categorization assistant. Use the transaction name to pick exactly one category from the provided list. Return ONLY a JSON array. Each element must be: {\"id\": number, \"category\": \"<one of categories>\"}. If unsure, use \"Other\". No extra text."
        },
        { role: "user", content: JSON.stringify(prompt) }
      ],
      temperature: 0.2
    };

    try {
      const res = await fetch(`${config.cerebras.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.cerebras.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Cerebras error: ${res.status} ${text}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      let parsed = safeJsonParse(content) as Categorization[] | null;
      if (!Array.isArray(parsed)) {
        parsed = null;
      }

      const byId = new Map<number, Categorization>();
      if (parsed) {
        parsed.forEach((item) => {
          if (typeof item?.id === "number" && item.category) {
            byId.set(item.id, item);
          }
        });
      }

      for (const row of batch) {
        const result = byId.get(row.id);
        const category = result
          ? normalizeCategory(result.category, categories)
          : heuristicCategory(row, categories);
        const confidence = result?.confidence ?? null;
        await query(
          `UPDATE qbo_transaction_list_rows
           SET ai_category=$1, ai_confidence=$2, ai_status='categorized', updated_at=NOW()
           WHERE id=$3`,
          [category, confidence, row.id]
        );
        categorized += 1;
        processed += 1;
        options?.onProgress?.({ total: rows.length, processed, categorized, failed });
      }
    } catch (err) {
      for (const row of batch) {
        const category = heuristicCategory(row, categories);
        await query(
          `UPDATE qbo_transaction_list_rows
           SET ai_category=$1, ai_status='categorized', updated_at=NOW()
           WHERE id=$2`,
          [category, row.id]
        );
        categorized += 1;
        processed += 1;
        options?.onProgress?.({ total: rows.length, processed, categorized, failed });
      }
    }
  }

  return { processed, categorized, failed };
};
