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

  const newsCount = newsItems.length;

  // Structured, auditable decomposition. Every component reports the points
  // it adds to the 0–100 score, how far that is from a neutral baseline (50),
  // and the raw driver behind it. This is the source of truth for the UI's
  // "why this score" panel and for grounding the AI analysis.
  const explanation = buildExplanation({
    parts: { momentum, sentiment, volumeSpike, newsImpact },
    raw: { changePercent, volRatio, sentimentScore, newsAvg, newsCount, avgVolume },
    score,
  });

  return {
    score,
    signal: signalFromScore(score),
    breakdown,
    // Point contribution of each component toward the 0–100 score.
    contributions: Object.fromEntries(
      explanation.components.map((c) => [c.key, c.points])
    ),
    explanation,
    reason: explanation.reason,
  };
}

const NEUTRAL = 0.5;

// Builds the per-component explanation array + a one-line summary.
function buildExplanation({ parts, raw, score }) {
  const meta = {
    momentum: {
      label: "Momentum",
      weight: WEIGHTS.momentum,
      detail: `${raw.changePercent >= 0 ? "+" : ""}${raw.changePercent.toFixed(2)}% today`,
      up: "rising price", down: "falling price",
    },
    sentiment: {
      label: "Sentiment",
      weight: WEIGHTS.sentiment,
      detail: `analyst sentiment ${raw.sentimentScore >= 0 ? "+" : ""}${raw.sentimentScore.toFixed(2)}`,
      up: "positive sentiment", down: "negative sentiment",
    },
    volumeSpike: {
      label: "Volume",
      weight: WEIGHTS.volumeSpike,
      detail: raw.avgVolume > 0 ? `${raw.volRatio.toFixed(1)}× avg volume` : "no volume data",
      up: "elevated volume", down: "thin volume",
    },
    newsImpact: {
      label: "News",
      weight: WEIGHTS.newsImpact,
      detail: raw.newsCount
        ? `${raw.newsCount} headline${raw.newsCount > 1 ? "s" : ""}, avg ${raw.newsAvg >= 0 ? "+" : ""}${raw.newsAvg.toFixed(2)}`
        : "no headlines",
      up: "upbeat headlines", down: "negative headlines",
    },
  };

  const components = Object.entries(parts).map(([key, v]) => {
    const m = meta[key];
    const points = Math.round(m.weight * v * 100);           // toward the 0–100 score
    const delta = Math.round(m.weight * (v - NEUTRAL) * 100); // vs neutral baseline
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return {
      key,
      label: m.label,
      weightPct: Math.round(m.weight * 100),
      normalized: Math.round(v * 100), // 0–100 strength of this component
      points,
      delta,
      direction,
      detail: m.detail,
      phrase: direction === "up" ? m.up : direction === "down" ? m.down : "neutral",
    };
  });

  // Strongest movers away from neutral, most significant first.
  const movers = components
    .filter((c) => Math.abs(c.delta) >= 2)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  // summary = point-annotated (for the "why this score" panel / advisor).
  const summary = movers.length
    ? movers.map((c) => `${c.detail} (${c.delta >= 0 ? "+" : ""}${c.delta} pts)`).join(", ")
    : "mixed / neutral signals";

  // reason = clean phrasing (for compact card display).
  const reason = movers.length
    ? movers.map((c) => c.phrase).join(", ")
    : "mixed / neutral signals";

  return {
    base: 50,
    total: Math.round(score * 100),
    net: Math.round(score * 100) - 50, // points above/below neutral
    components,
    summary,
    reason,
  };
}
