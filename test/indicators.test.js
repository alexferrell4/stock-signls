import { test } from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, detectFVG, computeTechnicals } from "../src/server/indicators.js";

test("ema follows the series and lands between recent values", () => {
  const flat = ema([10, 10, 10, 10, 10], 3);
  assert.equal(flat, 10);
  const rising = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
  assert.ok(rising > 8 && rising <= 10, `ema ${rising}`);
});

test("rsi is 100 for only-gains and 0 for only-losses", () => {
  const up = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(rsi(up, 14), 100);
  const down = Array.from({ length: 20 }, (_, i) => 20 - i);
  assert.equal(rsi(down, 14), 0);
});

test("rsi is null when the series is too short", () => {
  assert.equal(rsi([1, 2, 3], 14), null);
});

test("detectFVG finds a bullish gap", () => {
  // candle i-2 high (10) < candle i low (12) → bullish FVG
  const ohlc = [
    { open: 9, high: 10, low: 8, close: 9 },
    { open: 10, high: 13, low: 10, close: 12 },
    { open: 12, high: 14, low: 12, close: 13 },
  ];
  const fvg = detectFVG(ohlc);
  assert.equal(fvg.type, "bullish");
  assert.equal(fvg.bottom, 10);
  assert.equal(fvg.top, 12);
});

test("detectFVG finds a bearish gap", () => {
  const ohlc = [
    { open: 20, high: 21, low: 19, close: 20 },
    { open: 18, high: 18.5, low: 16, close: 17 },
    { open: 16, high: 17, low: 15, close: 16 },
  ];
  const fvg = detectFVG(ohlc);
  assert.equal(fvg.type, "bearish");
});

test("computeTechnicals bundles rsi/ema/fvg + trend", () => {
  const series = Array.from({ length: 20 }, (_, i) => ({ open: i, high: i + 1, low: i - 1, close: i + 1 }));
  const t = computeTechnicals(series, 25);
  assert.ok(t.ema9 != null && t.rsi != null);
  assert.equal(t.emaTrend, "above"); // price 25 above the rising ema
  assert.ok(["overbought", "oversold", "neutral"].includes(t.rsiZone));
});
