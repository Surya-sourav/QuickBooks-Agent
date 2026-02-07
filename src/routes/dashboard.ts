import { Router } from "express";
import { buildDashboard } from "../agents/analysisAgent";
import { getConnection } from "../qb/client";

const router = Router();

router.get("/dashboard", async (_req, res, next) => {
  try {
    const dashboard = await buildDashboard();
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

router.get("/connection", async (_req, res) => {
  try {
    const connection = await getConnection();
    res.json({
      connected: true,
      realmId: connection.realm_id,
      expiresAt: connection.expires_at
    });
  } catch (error) {
    res.json({ connected: false });
  }
});

export default router;
