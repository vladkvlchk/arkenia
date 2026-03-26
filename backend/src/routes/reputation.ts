import { Router, Request, Response } from "express";
import { getReputation } from "../services/contract";

const router = Router();

// GET /api/reputation/:wallet
router.get("/:wallet", async (req: Request, res: Response) => {
  try {
    const score = await getReputation(req.params.wallet);
    res.json({ wallet: req.params.wallet, reputation: score });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
