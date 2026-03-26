import { Router, Request, Response } from "express";
import { fetchTwitterScore } from "../services/twitterScore";
import { getProfile } from "../services/db";

const router = Router();

// GET /api/eligibility/:wallet — check TwitterScore for a linked wallet
router.get("/:wallet", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const profile = await getProfile(wallet);

    if (!profile || !profile.twitter_username) {
      res.json({ wallet, linked: false, twitterScore: null });
      return;
    }

    const score = await fetchTwitterScore(profile.twitter_username);
    res.json({
      wallet,
      linked: true,
      twitterUsername: profile.twitter_username,
      twitterScore: score,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
