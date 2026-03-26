import { Router, Request, Response } from "express";
import crypto from "crypto";
import { config } from "../config";
import { upsertProfile, getProfile, searchProfiles, getAllProfiles } from "../services/db";
import { fetchTwitterScore } from "../services/twitterScore";

const router = Router();

// In-memory store for PKCE & state (per OAuth flow)
const pendingFlows = new Map<
  string,
  { wallet: string; codeVerifier: string; expiresAt: number }
>();

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  return { verifier, challenge };
}

// GET /api/auth/twitter?wallet=0x...
router.get("/twitter", (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }

  const state = base64url(crypto.randomBytes(16));
  const { verifier, challenge } = generatePKCE();

  pendingFlows.set(state, {
    wallet,
    codeVerifier: verifier,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.twitterClientId,
    redirect_uri: `${config.backendUrl}/api/auth/twitter/callback`,
    scope: "tweet.read users.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

// GET /api/auth/twitter/callback
router.get("/twitter/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    res.status(400).json({ error: "Missing code or state" });
    return;
  }

  const flow = pendingFlows.get(state);
  if (!flow || flow.expiresAt < Date.now()) {
    pendingFlows.delete(state!);
    res.status(400).json({ error: "Invalid or expired state" });
    return;
  }
  pendingFlows.delete(state);

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.twitterClientId}:${config.twitterClientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: `${config.backendUrl}/api/auth/twitter/callback`,
        code_verifier: flow.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Twitter token exchange failed:", err);
      res.redirect(
        `${config.frontendUrl}/profile/${flow.wallet}?error=twitter_auth_failed`
      );
      return;
    }

    const { access_token } = await tokenRes.json();

    // Fetch user info
    const userRes = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    if (!userRes.ok) {
      console.error("Twitter user fetch failed:", await userRes.text());
      res.redirect(
        `${config.frontendUrl}/profile/${flow.wallet}?error=twitter_fetch_failed`
      );
      return;
    }

    const { data: user } = await userRes.json();

    // Save to DB
    await upsertProfile(flow.wallet, {
      id: user.id,
      username: user.username,
      avatar: user.profile_image_url || "",
    });

    res.redirect(`${config.frontendUrl}/profile/${flow.wallet}`);
  } catch (err: any) {
    console.error("Twitter OAuth error:", err);
    res.redirect(
      `${config.frontendUrl}/profile/${flow.wallet}?error=internal`
    );
  }
});

// GET /api/auth/profile/:wallet
router.get("/profile/:wallet", async (req: Request, res: Response) => {
  try {
    const profile = await getProfile(req.params.wallet);
    if (!profile) {
      res.json({ linked: false });
      return;
    }
    const score = await fetchTwitterScore(profile.twitter_username);
    res.json({
      linked: true,
      twitterUsername: profile.twitter_username,
      twitterAvatar: profile.twitter_avatar,
      twitterScore: score,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/profiles?q=search
router.get("/profiles", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || "";
    const profiles = q ? await searchProfiles(q) : await getAllProfiles();
    res.json(profiles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
