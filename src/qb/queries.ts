import { qboFetch } from "./client";

const DEFAULT_MAX_RESULTS = 500;

export async function fetchAllEntities(entity: string): Promise<any[]> {
  const results: any[] = [];
  let startPosition = 1;

  while (true) {
    const query = `select * from ${entity} startposition ${startPosition} maxresults ${DEFAULT_MAX_RESULTS}`;
    const response = await qboFetch(`query?query=${encodeURIComponent(query)}`);
    const queryResponse = response.QueryResponse ?? {};
    const items = queryResponse[entity] ?? [];
    if (Array.isArray(items)) {
      results.push(...items);
    }

    const received = Array.isArray(items) ? items.length : 0;
    if (received < DEFAULT_MAX_RESULTS) {
      break;
    }

    startPosition += DEFAULT_MAX_RESULTS;
  }

  return results;
}

export async function fetchTransactionList(params: {
  startDate: string;
  endDate: string;
}): Promise<any> {
  const qs = new URLSearchParams({
    start_date: params.startDate,
    end_date: params.endDate
  });

  return qboFetch(`reports/TransactionList?${qs.toString()}`);
}
