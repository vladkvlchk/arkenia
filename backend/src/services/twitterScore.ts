const scoreCache = new Map<string, { score: number; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchTwitterScore(username: string): Promise<number | null> {
  const key = username.toLowerCase();

  const cached = scoreCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.score;
  }

  try {
    const res = await fetch(
      `https://twitterscore.io/twitter/graph/ajax/?accountSlug=${encodeURIComponent(username)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.scores || data.scores.length === 0) return null;

    const latest = data.scores[data.scores.length - 1];
    const score = Math.round(latest.value);

    scoreCache.set(key, { score, fetchedAt: Date.now() });
    return score;
  } catch {
    return null;
  }
}
