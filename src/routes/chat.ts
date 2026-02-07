import { Router } from "express";
import { runAnalysisAgent } from "../agents/analysisAgent.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  const message = req.body?.message?.toString() ?? "";
  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const response = await runAnalysisAgent(message);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
