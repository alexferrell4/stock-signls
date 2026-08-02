// ─── Signal Engine ──────────────────────────────────────────────
// Pure functions — no network, no side effects. Trivially unit-testable
// (see test/signal.test.js), which is why the whole scoring model lives
// here instead of inline in the route handlers.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = (v) => Math.round(v * 100) / 100;

// Naive lexicon sentiment for headlines. Good enough as a baseline signal;
// Phase 1 can swap this for a model-scored value without touching callers.
const POS = ["beat", "beats", "surge", "surges", "rally", "record", "upgrade", "upgraded", "buy", "strong", "growth", "profit", "gain", "gains", "positive", "bullish", "outperform", "exceed", "exceeds", "rises", "high", "soars", "jumps", "boosts", "wins", "expands"];
const NEG = ["miss", "misses", "plunge", "plunges", "fall", "falls", "drop", "drops", "downgrade", "downgraded", "sell", "weak", "loss", "losses", "decline", "declines", "negative", "bearish", "underperform", "below", "cut", "cuts", "layoff", "layoffs", "recall", "lawsuit", "fine", "crash", "slump", "warns", "probe", "delay", "delays"];

export function scoreText(text) {
  if (!text) return 0;
  let score = 0;
  for (const w of text.toLowerCase().split(/\W+/)) {
    if (POS.includes(w)) score += 0.15;
    if (NEG.includes(w)) score -= 0.15;
  }
  return clamp(round2(score), -1, 1);
}

// Component weights. Kept as a named export so the UI and any future
// "what-if" tooling can display/adjust them from one place.
export const WEIGHTS = {
  momentum: 0.4,
  sentiment: 0.3,
  volumeSpike: 0.2,
  newsImpact: 0.1,
};

export const THRESHOLDS = { buy: 0.65, hold: 0.45 };

export function signalFromScore(score) {
  if (score >= THRESHOLDS.buy) return "BUY";
  if (score >= THRESHOLDS.hold) return "HOLD";
  return "SELL";
}

export function computeSignal({
  changePercent = 0,
  currentVolume = 0,
  avgVolume = 0,
  sentimentScore = 0,
  newsItems = [],
} = {}) {
  // Each component is normalized to [0,1].
  const momentum = (clamp(changePercent, -10, 10) + 10) / 20;
  const volRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  const volumeSpike = avgVolume > 0 ? clamp(volRatio / 2, 0, 1) : 0.5;
  const sentiment = (clamp(sentimentScore, -1, 1) + 1) / 2;
  const newsAvg = newsItems.length
    ? newsItems.reduce((s, n) => s + (n.sentiment ?? 0), 0) / newsItems.length
    : 0;
  const newsImpact = (clamp(newsAvg, -1, 1) + 1) / 2;

  const score = round2(
    WEIGHTS.momentum * momentum +
    WEIGHTS.sentiment * sentiment +
    WEIGHTS.volumeSpike * volumeSpike +
    WEIGHTS.newsImpact * newsImpact
  );

  const breakdown = {
    momentum: round2(momentum),
    sentiment: round2(sentiment),
    volumeSpike: round2(volumeSpike),
    newsImpact: round2(newsImpact),
  };

  return {
    score,
    signal: signalFromScore(score),
    breakdown,
    // Point contribution of each component toward the 0–100 score, so the
    // UI can say *why* a stock scored the way it did (Phase 1 groundwork).
    contributions: {
      momentum: Math.round(WEIGHTS.momentum * momentum * 100),
      sentiment: Math.round(WEIGHTS.sentiment * sentiment * 100),
      volumeSpike: Math.round(WEIGHTS.volumeSpike * volumeSpike * 100),
      newsImpact: Math.round(WEIGHTS.newsImpact * newsImpact * 100),
    },
    reason: explain({ changePercent, volRatio, sentimentScore, newsAvg, newsCount: newsItems.length }),
  };
}

// Human-readable one-liner explaining the dominant drivers.
function explain({ changePercent, volRatio, sentimentScore, newsAvg, newsCount }) {
  const parts = [];
  if (changePercent >= 1) parts.push(`up ${changePercent.toFixed(1)}% today`);
  else if (changePercent <= -1) parts.push(`down ${Math.abs(changePercent).toFixed(1)}% today`);
  if (volRatio >= 1.5) parts.push(`volume ${volRatio.toFixed(1)}× average`);
  else if (volRatio > 0 && volRatio <= 0.6) parts.push(`thin volume (${volRatio.toFixed(1)}× avg)`);
  if (sentimentScore >= 0.15) parts.push("positive analyst sentiment");
  else if (sentimentScore <= -0.15) parts.push("negative analyst sentiment");
  if (newsCount && newsAvg >= 0.1) parts.push("upbeat headlines");
  else if (newsCount && newsAvg <= -0.1) parts.push("negative headlines");
  return parts.length ? parts.join(", ") : "mixed / neutral signals";
}
