// ─── Mock Data Provider ─────────────────────────────────────────
// Zero-network, zero-credit data source. This is the DEFAULT provider so
// the whole app — pipeline, signals, chat, advisor — runs and is testable
// without ever touching a paid API key.
//
// Data is deterministic per ticker (seeded PRNG) but drifts each refresh
// cycle, so hitting "Refresh" visibly changes prices/scores like the real
// thing while tests stay reproducible for a given cycle.

import { TICKERS, companyName } from "../universe.js";

const round2 = (v) => Math.round(v * 100) / 100;

// Small string hash → 32-bit seed.
function seedFor(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mulberry32 PRNG — fast, deterministic, good enough for fixtures.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rough per-ticker base prices so the mock looks plausible.
const BASE_PRICE = {
  AAPL: 225, MSFT: 430, TSLA: 250, GOOGL: 175, AMZN: 185,
  META: 500, NVDA: 120, AMD: 160, NFLX: 640, COIN: 230,
  PLTR: 55, SOFI: 9, RIVN: 13, SMCI: 45, MSTR: 1500,
};

const HEADLINE_TEMPLATES = [
  { t: (c) => `${c} beats quarterly expectations as revenue surges`, s: 0.6 },
  { t: (c) => `Analysts upgrade ${c} on strong growth outlook`, s: 0.5 },
  { t: (c) => `${c} unveils new product, shares rally`, s: 0.4 },
  { t: (c) => `${c} stock jumps after record guidance`, s: 0.6 },
  { t: (c) => `${c} holds steady amid mixed market signals`, s: 0.0 },
  { t: (c) => `${c} trades flat as investors await earnings`, s: 0.0 },
  { t: (c) => `${c} slips as broader market declines`, s: -0.4 },
  { t: (c) => `${c} downgraded on valuation concerns`, s: -0.5 },
  { t: (c) => `${c} plunges after disappointing outlook`, s: -0.6 },
  { t: (c) => `Regulators probe ${c} over compliance issues`, s: -0.5 },
];
const SOURCES = ["Reuters", "Bloomberg", "CNBC", "MarketWatch", "Barron's", "The Verge"];

// A "cycle" nudges every ticker's randomness so refreshes differ.
export function makeMockProvider() {
  let cycle = 0;

  async function quote(ticker) {
    const r = rng(seedFor(ticker) + cycle * 7919);
    const base = BASE_PRICE[ticker] ?? 100;
    const changePercent = (r() - 0.48) * 12; // roughly -5.8%..+6.4%
    const price = Math.round(base * (1 + changePercent / 100) * 100) / 100;
    const prevClose = Math.round((price / (1 + changePercent / 100)) * 100) / 100;
    const high = Math.round(price * (1 + r() * 0.03) * 100) / 100;
    const low = Math.round(price * (1 - r() * 0.03) * 100) / 100;
    const open = Math.round(prevClose * (1 + (r() - 0.5) * 0.02) * 100) / 100;
    const avgVolume = Math.round((2_000_000 + r() * 40_000_000));
    const currentVolume = Math.round(avgVolume * (0.4 + r() * 2.2));
    return {
      price, changePercent: Math.round(changePercent * 100) / 100,
      high, low, open, prevClose,
      currentVolume, avgVolume,
      sentimentScore: Math.round((r() - 0.5) * 1.6 * 100) / 100, // -0.8..0.8
    };
  }

  async function news(ticker) {
    const r = rng(seedFor(ticker + "news") + cycle * 104729);
    const company = companyName(ticker).replace(/ (Inc\.|Corp\.|Global|Technologies|Automotive|Platforms).*$/, "");
    const count = 3 + Math.floor(r() * 3);
    const items = [];
    for (let i = 0; i < count; i++) {
      const tpl = HEADLINE_TEMPLATES[Math.floor(r() * HEADLINE_TEMPLATES.length)];
      items.push({
        headline: tpl.t(company),
        source: SOURCES[Math.floor(r() * SOURCES.length)],
        url: null,
        sentiment: tpl.s,
        publishedAt: new Date(Date.now() - i * 3600_000).toISOString(),
      });
    }
    return items;
  }

  // Per-timeframe % changes. Daily comes from the quote; weekly/monthly are
  // synthetic but scaled larger (longer windows swing more), and drift each
  // cycle like everything else.
  async function changes(ticker, price, dailyChange) {
    const r = rng(seedFor(ticker + "tf") + cycle * 13);

    // Synthesize ~22 daily closes ending at the current price (random walk
    // back in time, then reversed so the last point is `price`).
    const N = 22;
    const back = [];
    let p = price;
    for (let i = 0; i < N; i++) { back.push(Math.round(p * 100) / 100); p = p * (1 + (r() - 0.5) * 0.035); }
    back.reverse();
    const now = Date.now();
    const series = back.map((close, i) => ({ t: now - (N - 1 - i) * 86_400_000, close }));

    return {
      daily: dailyChange,
      weekly: Math.round((r() - 0.45) * 20 * 100) / 100,   // ~ -9%..+11%
      monthly: Math.round((r() - 0.42) * 42 * 100) / 100,  // ~ -18%..+24%
      series,
    };
  }

  // Price series whose shape matches the timeframe: intraday for daily, a few
  // days for weekly, ~a month for monthly. Random walk ending at `price`.
  async function chartSeries(ticker, timeframe, price) {
    const cfg = {
      daily: { n: 52, dt: 7.5 * 60_000, vol: 0.004 },   // ~6.5h of 7.5-min bars
      weekly: { n: 40, dt: 3 * 3600_000, vol: 0.011 },  // ~5 days of 3h bars
      monthly: { n: 22, dt: 86_400_000, vol: 0.02 },    // ~1 month of daily
    }[timeframe] ?? { n: 22, dt: 86_400_000, vol: 0.02 };

    const r = rng(seedFor(ticker + timeframe + "chart") + cycle * 3);
    const back = [];
    let p = price || 100;
    for (let i = 0; i < cfg.n; i++) { back.push(round2(p)); p = p * (1 + (r() - 0.5) * cfg.vol * 2); }
    back.reverse();
    const now = Date.now();
    // Build OHLC per bar so the chart can render candlesticks too.
    return back.map((close, i) => {
      const open = i > 0 ? back[i - 1] : round2(close * (1 + (r() - 0.5) * cfg.vol));
      const high = round2(Math.max(open, close) * (1 + r() * cfg.vol));
      const low = round2(Math.min(open, close) * (1 - r() * cfg.vol));
      return { t: now - (cfg.n - 1 - i) * cfg.dt, open, high, low, close };
    });
  }

  return {
    mode: "mock",
    tickers: TICKERS,
    quote,
    news,
    changes,
    chartSeries,
    // advance the drift so the next refresh looks different
    tick() { cycle += 1; },
  };
}
