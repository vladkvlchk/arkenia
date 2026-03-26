import { Router, Request, Response } from "express";
import { getComments, insertComment } from "../services/db";

const router = Router();

// GET /api/comments/:campaign
router.get("/:campaign", async (req: Request, res: Response) => {
  try {
    const comments = await getComments(req.params.campaign);
    res.json(comments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/comments/:campaign
router.post("/:campaign", async (req: Request, res: Response) => {
  try {
    const { author, content, parentId } = req.body;
    if (!author || !content) {
      res.status(400).json({ error: "author and content required" });
      return;
    }
    if (content.length > 2000) {
      res.status(400).json({ error: "content too long (max 2000 chars)" });
      return;
    }
    const comment = await insertComment(
      req.params.campaign,
      author,
      content,
      parentId ?? null
    );
    res.status(201).json(comment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
