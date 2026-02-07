import express from "express";
import cors from "cors";
import path from "node:path";
import { config } from "./config";
import { ensureConnection } from "./db";
import authRoutes from "./routes/auth";
import ingestRoutes from "./routes/ingest";
import chatRoutes from "./routes/chat";
import dashboardRoutes from "./routes/dashboard";
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/auth", authRoutes);
app.use("/api", ingestRoutes);
app.use("/api", chatRoutes);
app.use("/api", dashboardRoutes);
app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});
const publicDir = path.resolve(__dirname, "..", "public");
app.use(express.static(publicDir));
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message });
});
ensureConnection()
    .then(() => {
    app.listen(config.port, () => {
        console.log(`Server running on ${config.baseUrl}`);
    });
})
    .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
});
