import { Router } from "express";
import { ingestAll } from "../qbo/ingest.js";
export const ingestRouter = Router();
ingestRouter.post("/run", async (_req, res) => {
    try {
        const result = await ingestAll();
        res.json({ ok: true, result });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
