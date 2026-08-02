import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSignal, signalFromScore, scoreText, THRESHOLDS } from "../src/server/signal.js";

test("signalFromScore respects thresholds", () => {
  assert.equal(signalFromScore(THRESHOLDS.buy), "BUY");
  assert.equal(signalFromScore(THRESHOLDS.buy - 0.01), "HOLD");
  assert.equal(signalFromScore(THRESHOLDS.hold), "HOLD");
  assert.equal(signalFromScore(THRESHOLDS.hold - 0.01), "SELL");
});

test("computeSignal returns a normalized score in [0,1] with a breakdown", () => {
  const r = computeSignal({ changePercent: 3, currentVolume: 2e6, avgVolume: 1e6, sentimentScore: 0.4, newsItems: [{ sentiment: 0.5 }] });
  assert.ok(r.score >= 0 && r.score <= 1);
  assert.ok(["BUY", "HOLD", "SELL"].includes(r.signal));
  for (const k of ["momentum", "sentiment", "volumeSpike", "newsImpact"]) {
    assert.ok(r.breakdown[k] >= 0 && r.breakdown[k] <= 1, `${k} in range`);
  }
});

test("computeSignal contributions sum to roughly the score", () => {
  const r = computeSignal({ changePercent: 5, currentVolume: 3e6, avgVolume: 1e6, sentimentScore: 0.6, newsItems: [{ sentiment: 0.4 }] });
  const sum = Object.values(r.contributions).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - Math.round(r.score * 100)) <= 1, `contributions ${sum} ≈ score ${Math.round(r.score * 100)}`);
});

test("computeSignal clamps extreme inputs", () => {
  const hot = computeSignal({ changePercent: 999, currentVolume: 1e12, avgVolume: 1, sentimentScore: 99, newsItems: [{ sentiment: 99 }] });
  assert.ok(hot.score <= 1);
  const cold = computeSignal({ changePercent: -999, currentVolume: 0, avgVolume: 1e9, sentimentScore: -99, newsItems: [{ sentiment: -99 }] });
  assert.ok(cold.score >= 0);
});

test("computeSignal handles empty input without throwing", () => {
  const r = computeSignal();
  assert.ok(r.score >= 0 && r.score <= 1);
  assert.equal(typeof r.reason, "string");
});

test("explanation decomposes the score into auditable components", () => {
  const r = computeSignal({ changePercent: 4, currentVolume: 3e6, avgVolume: 1e6, sentimentScore: 0.5, newsItems: [{ sentiment: 0.4 }, { sentiment: 0.2 }] });
  const ex = r.explanation;
  assert.equal(ex.base, 50);
  assert.equal(ex.total, Math.round(r.score * 100));
  assert.equal(ex.net, ex.total - 50);
  assert.equal(ex.components.length, 4);

  // Points sum to the total score.
  const sumPoints = ex.components.reduce((a, c) => a + c.points, 0);
  assert.ok(Math.abs(sumPoints - ex.total) <= 1, `points ${sumPoints} ≈ total ${ex.total}`);

  // Deltas (vs neutral) sum to net.
  const sumDelta = ex.components.reduce((a, c) => a + c.delta, 0);
  assert.ok(Math.abs(sumDelta - ex.net) <= 1, `deltas ${sumDelta} ≈ net ${ex.net}`);

  // Each component is fully described.
  for (const c of ex.components) {
    assert.ok(c.label && c.detail && c.phrase);
    assert.ok(["up", "down", "flat"].includes(c.direction));
    assert.equal(typeof c.delta, "number");
  }
});

test("explanation reflects direction of a bullish vs bearish stock", () => {
  const bull = computeSignal({ changePercent: 8, currentVolume: 4e6, avgVolume: 1e6, sentimentScore: 0.7, newsItems: [{ sentiment: 0.6 }] });
  const bear = computeSignal({ changePercent: -8, currentVolume: 5e5, avgVolume: 1e6, sentimentScore: -0.7, newsItems: [{ sentiment: -0.6 }] });
  assert.ok(bull.explanation.net > 0 && bear.explanation.net < 0);
  assert.equal(bull.explanation.components.find((c) => c.key === "momentum").direction, "up");
  assert.equal(bear.explanation.components.find((c) => c.key === "momentum").direction, "down");
});

test("scoreText scores positive and negative lexicon", () => {
  assert.ok(scoreText("stock surges to record beat upgrade") > 0);
  assert.ok(scoreText("shares plunge on downgrade and lawsuit") < 0);
  assert.equal(scoreText(""), 0);
  assert.equal(scoreText("the a an of"), 0);
});
