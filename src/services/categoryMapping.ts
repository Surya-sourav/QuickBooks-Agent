import { query } from "../db.js";

type AccountRow = {
  qbo_id: string;
  name: string | null;
  account_type: string | null;
  account_sub_type: string | null;
  classification: string | null;
  active: boolean | null;
};

type CategoryRule = {
  category: string;
  types: string[];
  classifications: string[];
  keywords: string[];
};

const rules: CategoryRule[] = [
  { category: "Income", types: ["income", "other income"], classifications: ["revenue"], keywords: ["sales", "revenue", "income"] },
  { category: "COGS", types: ["cost of goods sold"], classifications: ["expense"], keywords: ["cogs", "cost of goods", "inventory"] },
  { category: "Payroll", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["payroll", "salary", "wages"] },
  { category: "Rent", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["rent", "lease"] },
  { category: "Utilities", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["utilities", "utility", "electric", "water", "gas", "internet"] },
  { category: "Marketing", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["marketing", "advertising", "ads"] },
  { category: "Travel", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["travel", "meals", "entertainment", "lodging"] },
  { category: "Software", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["software", "subscription", "saas"] },
  { category: "Insurance", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["insurance"] },
  { category: "Repairs", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["repair", "maintenance"] },
  { category: "Bank Fees", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["bank", "fee", "service charge", "merchant"] },
  { category: "Taxes", types: ["expense", "other expense"], classifications: ["expense"], keywords: ["tax"] },
  { category: "Other", types: ["expense", "other expense"], classifications: ["expense"], keywords: [] }
];

const normalize = (value: string | null) => (value ?? "").toLowerCase();

const scoreAccount = (account: AccountRow, rule: CategoryRule) => {
  let score = 0;
  const name = normalize(account.name);
  const type = normalize(account.account_type);
  const subtype = normalize(account.account_sub_type);
  const classification = normalize(account.classification);

  if (account.active === false) score -= 2;

  if (rule.types.some((t) => type === t)) score += 4;
  if (rule.classifications.some((c) => classification === c)) score += 2;

  for (const keyword of rule.keywords) {
    const key = keyword.toLowerCase();
    if (name.includes(key) || subtype.includes(key)) {
      score += 5;
      break;
    }
  }

  return score;
};

export const autoGenerateMappings = async (categories: string[]) => {
  const accountsRes = await query<AccountRow>(
    `SELECT qbo_id, name, account_type, account_sub_type, classification, active
     FROM qbo_accounts
     ORDER BY name ASC`
  );
  const accounts = accountsRes.rows;

  const existingRes = await query(
    "SELECT category FROM ai_category_account_map"
  );
  const existing = new Set(existingRes.rows.map((row) => row.category));

  const created: Array<{ category: string; accountId: string; accountName: string | null }> = [];

  for (const category of categories) {
    if (existing.has(category)) continue;

    const rule = rules.find((r) => r.category.toLowerCase() === category.toLowerCase());
    if (!rule) continue;

    let best: AccountRow | null = null;
    let bestScore = 0;
    for (const account of accounts) {
      const score = scoreAccount(account, rule);
      if (score > bestScore) {
        bestScore = score;
        best = account;
      }
    }

    if (best && bestScore > 0) {
      await query(
        `INSERT INTO ai_category_account_map (category, account_id, account_name)
         VALUES ($1,$2,$3)
         ON CONFLICT (category) DO UPDATE SET
           account_id=EXCLUDED.account_id,
           account_name=EXCLUDED.account_name,
           updated_at=NOW()`,
        [category, best.qbo_id, best.name]
      );
      created.push({ category, accountId: best.qbo_id, accountName: best.name ?? null });
    }
  }

  return { created };
};
