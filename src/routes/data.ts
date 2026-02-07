import { Router } from "express";
import { buildSummary } from "../services/insights.js";

export const dataRouter = Router();

dataRouter.get("/summary", async (_req, res) => {
  try {
    const summary = await buildSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
