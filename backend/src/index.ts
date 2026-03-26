import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { initContract } from "./services/contract";
import { initDb } from "./services/db";
import eligibilityRoutes from "./routes/eligibility";
import campaignRoutes from "./routes/campaigns";
import reputationRoutes from "./routes/reputation";
import authRoutes from "./routes/auth";
import statsRoutes from "./routes/stats";
import commentsRoutes from "./routes/comments";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", contractAddress: config.contractAddress });
});

// Routes
app.use("/api/eligibility", eligibilityRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/reputation", reputationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/comments", commentsRoutes);

// Init services and start server
async function start() {
  try {
    initContract();
    console.log("Contract service initialized");
  } catch (err) {
    console.warn("Contract service not initialized:", err);
  }

  try {
    await initDb();
    console.log("Database initialized");
  } catch (err) {
    console.warn("Database not initialized (is Postgres running?):", err);
  }

  app.listen(config.port, () => {
    console.log(`Backend API running on http://localhost:${config.port}`);
  });
}

start();
