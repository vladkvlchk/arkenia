import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { getCampaignStats, getAllCampaignStats, getUserStats, getLeaderboard, upsertCampaignMeta, getCampaignMeta, getAllCampaignMeta, getCampaignsByUsername, getEventsForCampaign } from "../services/db";
import { config } from "../config";

const router = Router();

// File upload setup
const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../uploads"),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

router.get("/campaign/:address", async (req: Request, res: Response) => {
  try {
    const stats = await getCampaignStats(req.params.address);
    if (!stats) {
      res.json(null);
      return;
    }
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/campaign/:address/events", async (req: Request, res: Response) => {
  try {
    const events = await getEventsForCampaign(req.params.address);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/campaigns", async (_req: Request, res: Response) => {
  try {
    const stats = await getAllCampaignStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/user/:wallet", async (req: Request, res: Response) => {
  try {
    const stats = await getUserStats(req.params.wallet);
    if (!stats) {
      res.json(null);
      return;
    }
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const sortBy = (req.query.sort as string) || "creator_pnl";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const rows = await getLeaderboard(sortBy, limit);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve twitter username to campaigns
router.get("/campaigns/by-username/:username", async (req: Request, res: Response) => {
  try {
    const campaigns = await getCampaignsByUsername(req.params.username);
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Campaign metadata ---

router.post(
  "/campaign/:address/meta",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const { creator, name, description } = req.body;
      if (!creator || !name) {
        res.status(400).json({ error: "creator and name are required" });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const logoFile = files?.logo?.[0];
      const coverFile = files?.cover?.[0];

      const baseUrl = config.backendUrl;
      const logoUrl = logoFile ? `${baseUrl}/uploads/${logoFile.filename}` : "";
      const coverUrl = coverFile ? `${baseUrl}/uploads/${coverFile.filename}` : "";

      await upsertCampaignMeta(
        req.params.address,
        creator,
        name,
        description || "",
        logoUrl,
        coverUrl
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/campaign/:address/meta", async (req: Request, res: Response) => {
  try {
    const meta = await getCampaignMeta(req.params.address);
    res.json(meta);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/campaigns/meta", async (_req: Request, res: Response) => {
  try {
    const meta = await getAllCampaignMeta();
    res.json(meta);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
