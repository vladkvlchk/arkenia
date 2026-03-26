import { Router, Request, Response } from "express";
import { getCampaigns, getCampaign } from "../services/contract";

const router = Router();

// GET /api/campaigns — list all campaigns
router.get("/", async (_req: Request, res: Response) => {
  try {
    const campaigns = await getCampaigns();
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id — single campaign with funders
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }
    const campaign = await getCampaign(id);
    res.json(campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
