import { Router } from "express";
import { getConnection, qboGet } from "../qbo/client.js";
import { config } from "../config.js";

export const companyRouter = Router();

companyRouter.get("/", async (_req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) {
      return res.json({ connected: false });
    }

    const data = await qboGet<any>(`/v3/company/${conn.realm_id}/companyinfo/${conn.realm_id}`, {
      minorversion: config.qbo.minorVersion
    });

    const company = data?.CompanyInfo ?? null;
    res.json({ connected: true, company });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});
