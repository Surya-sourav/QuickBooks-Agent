import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { ingestRouter } from "./routes/ingest.js";
import { chatRouter } from "./routes/chat.js";
import { dataRouter } from "./routes/data.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});
app.use("/api/auth", authRouter);
app.use("/api/ingest", ingestRouter);
app.use("/api/chat", chatRouter);
app.use("/api/data", dataRouter);
app.use(express.static(path.join(__dirname, "../public")));
app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});
app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`QBO redirect URI: ${config.qbo.redirectUri}`);
});
