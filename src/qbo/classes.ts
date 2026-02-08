import { qboPost, qboQuery } from "./client.js";

export const ensureClass = async (realmId: string, name: string) => {
  const query = `SELECT * FROM Class WHERE Name = '${name.replace(/'/g, "''")}'`; 
  const res = await qboQuery<any>(realmId, query);
  const existing = res?.QueryResponse?.Class?.[0];
  if (existing?.Id) {
    return existing.Id as string;
  }

  const created = await qboPost<any>(`/v3/company/${realmId}/class`, {
    Name: name,
    Active: true
  });

  return created?.Class?.Id as string;
};
