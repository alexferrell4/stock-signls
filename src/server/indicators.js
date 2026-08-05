// ─── Technical Indicators ───────────────────────────────────────
// Pure functions over a price series. No I/O → unit-testable. Fed from the
// daily OHLC series the provider already fetches (Yahoo 1mo/1d).

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

// Exponential moving average — returns the latest EMA value.
export function ema(values, period) {
  if (!values || values.length === 0) return null;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return round2(e);
}

// Wilder's RSI over `period` (default 14). Returns 0–100 or null if too short.
export function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

// Most recent Fair Value Gap (ICT 3-candle imbalance): a gap between candle
// i-2 and candle i that candle i-1 didn't fill. Bullish = gap up, bearish = down.
export function detectFVG(ohlc) {
  if (!ohlc || ohlc.length < 3) return null;
  for (let i = ohlc.length - 1; i >= 2; i--) {
    const a = ohlc[i - 2], c = ohlc[i];
    if (a.high != null && c.low != null && a.high < c.low) {
      return { type: "bullish", bottom: round2(a.high), top: round2(c.low), barsAgo: ohlc.length - 1 - i };
    }
    if (a.low != null && c.high != null && a.low > c.high) {
      return { type: "bearish", top: round2(a.low), bottom: round2(c.high), barsAgo: ohlc.length - 1 - i };
    }
  }
  return null;
}

// Bundle the technicals for a stock from its daily OHLC series + current price.
export function computeTechnicals(series, price) {
  const closes = (series ?? []).map((p) => p.close).filter((x) => x != null);
  if (price != null) closes.push(price); // include the live price as the latest point
  const ema9 = ema(closes, 9);
  const r = rsi(closes, 14);
  return {
    rsi: r,
    rsiZone: r == null ? null : r >= 70 ? "overbought" : r <= 30 ? "oversold" : "neutral",
    ema9,
    emaTrend: ema9 != null && price != null ? (price >= ema9 ? "above" : "below") : null,
    fvg: detectFVG(series),
  };
}
