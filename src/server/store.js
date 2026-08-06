// ─── In-memory Store + Refresh Pipeline ─────────────────────────
// Holds the latest computed signals, news, and a short intraday score
// history per ticker (feeds the modal chart). Durable snapshots + the
// historical track record are persisted via the injected `db` (SQLite).

import { computeSignal, scoreText } from "./signal.js";
import { companyName, TIMEFRAMES } from "./universe.js";
import { detectAlerts } from "./alerts.js";
import { computeTechnicals } from "./indicators.js";

const HISTORY_LEN = 60; // keep last N score points per ticker

// No-op fallbacks so the store works with or without a DB / alert channel
// (e.g. Phase 0/1 tests that don't care about persistence or alerting).
const NO_DB = {
  recordSnapshot() {}, evaluatePending() { return 0; },
  listHoldings() { return []; }, recordAlert() { return 0; },
};
const NO_CHANNEL = { deliver() {} };

export function createStore({ provider, ai, db = NO_DB, channel = NO_CHANNEL }) {
  const store = {
    stocks: {},        // ticker -> enriched signal object
    news: {},          // ticker -> [news items]
    history: {},       // ticker -> [{ time, score, signal }]
    priceHistory: {},  // ticker -> [{ t, close }] daily price series
    // Seeded from the DB so alert detection survives a restart (detects signal
    // changes that happened while the server was down, not just within a run).
    lastSignals: db.getLastSignals ? db.getLastSignals() : {},
    lastUpdated: null,
    nextUpdate: null,
    refreshing: false,
    lastError: null,
  };

  function pushHistory(ticker, score, signal) {
    const arr = store.history[ticker] ?? (store.history[ticker] = []);
    arr.push({
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      t: Date.now(),
      score,
      signal,
    });
    if (arr.length > HISTORY_LEN) arr.shift();
  }

  async function refreshOne(ticker) {
    const quote = await provider.quote(ticker);
    const news = await provider.news(ticker);
    const changes = provider.changes
      ? await provider.changes(ticker, quote.price, quote.changePercent)
      : { daily: quote.changePercent, weekly: null, monthly: null };

    // Volume comes from the provider's changes() when present (live pulls it
    // from Yahoo), else the quote (mock). Sentiment is real in live via analyst
    // recommendations. So all four signal inputs can now carry real data.
    const currentVolume = changes.currentVolume || quote.currentVolume || 0;
    const avgVolume = changes.avgVolume || quote.avgVolume || 0;

    // Inputs shared across every timeframe — only the change % (momentum) differs.
    const common = {
      currentVolume,
      avgVolume,
      sentimentScore: quote.sentimentScore,
      newsItems: news,
      available: {
        volume: avgVolume > 0 && currentVolume > 0,
        sentiment: quote.sentimentAvailable !== false,
      },
    };

    // A full signal per timeframe (daily/weekly/monthly). Momentum uses that
    // window's change; sentiment/volume/news are the same. AI analysis is
    // generated per timeframe in mock mode; in live-AI mode only daily is
    // generated (and reused) to avoid tripling Claude spend.
    const timeframes = {};
    let dailyAnalysis = null;
    for (const tf of TIMEFRAMES) {
      const ch = changes[tf];
      if (ch == null) { timeframes[tf] = null; continue; }
      const sig = computeSignal({ ...common, changePercent: ch });
      let analysis;
      if (ai.mode === "mock" || tf === "daily") {
        analysis = await ai.generateAnalysis({
          ticker, company: companyName(ticker),
          quote: { ...quote, changePercent: ch }, signal: sig, news,
        });
        if (tf === "daily") dailyAnalysis = analysis;
      } else {
        analysis = dailyAnalysis;
      }
      timeframes[tf] = {
        changePercent: ch,
        score: sig.score, signal: sig.signal,
        breakdown: sig.breakdown, contributions: sig.contributions,
        explanation: sig.explanation, reason: sig.reason,
        aiAnalysis: analysis,
      };
    }

    // Technical indicators from the daily OHLC series (9 EMA, RSI, FVG), plus
    // volume-vs-average and the change since today's open.
    const technicals = {
      ...computeTechnicals(changes.series, quote.price),
      volumeVsAvg: avgVolume > 0 ? Math.round((currentVolume / avgVolume) * 100) / 100 : null,
    };
    const changeFromOpen = quote.open > 0 ? Math.round(((quote.price - quote.open) / quote.open) * 10000) / 100 : null;

    // Top-level fields mirror the DAILY timeframe (canonical for alerts,
    // track record, portfolio, and any client that ignores timeframes).
    const daily = timeframes.daily ?? {};
    const stock = {
      ticker,
      company: companyName(ticker),
      price: quote.price,
      prevClose: quote.prevClose,
      high: quote.high,
      low: quote.low,
      open: quote.open,
      volume: currentVolume,
      avgVolume,
      finnhubSentiment: quote.sentimentScore,
      technicals,
      changeFromOpen,
      ...daily,
      timeframes,
      updatedAt: new Date().toISOString(),
    };

    store.stocks[ticker] = stock;
    store.news[ticker] = news;
    if (Array.isArray(changes.series) && changes.series.length) store.priceHistory[ticker] = changes.series;
    pushHistory(ticker, daily.score ?? 0, daily.signal ?? "HOLD");
    return stock;
  }

  // Refresh the whole universe. Spaced out to respect rate limits in live
  // mode; in mock mode the sleep is harmless and keeps timing realistic.
  async function refreshAll({ spacingMs = 0 } = {}) {
    if (store.refreshing) return;
    store.refreshing = true;
    store.lastError = null;
    try {
      // Previous signals come from the persisted map (seeded from the DB on
      // startup), so transitions are detected even across a restart.
      const prevSignals = { ...store.lastSignals };

      const prices = {};
      for (const ticker of provider.tickers) {
        try {
          const s = await refreshOne(ticker);
          prices[ticker] = s.price;
        } catch (e) {
          store.lastError = `${ticker}: ${e.message}`;
        }
        if (spacingMs) await new Promise((r) => setTimeout(r, spacingMs));
      }

      // Track record: grade prior signals against these fresh prices FIRST,
      // then record this cycle's signals (so they're graded next time).
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      store.lastEvaluated = db.evaluatePending(prices, nowMs);
      for (const ticker of Object.keys(prices)) {
        const s = store.stocks[ticker];
        db.recordSnapshot({
          ticker, ts: nowIso, tsMs: nowMs,
          price: s.price, score: s.score, signal: s.signal, changePercent: s.changePercent,
        });
      }

      // Alerting: fire on any signal transition, prioritizing held positions.
      const heldSet = new Set(db.listHoldings().map((h) => h.ticker));
      const alerts = detectAlerts(prevSignals, store.stocks, heldSet, nowMs);
      for (const a of alerts) {
        db.recordAlert(a);
        try { await channel.deliver(a); } catch { /* delivery is best-effort */ }
      }
      store.lastAlerts = alerts.length;

      // Persist the current signals as the new baseline for next time.
      for (const ticker of Object.keys(store.stocks)) store.lastSignals[ticker] = store.stocks[ticker].signal;

      provider.tick?.();
      store.lastUpdated = nowIso;
    } finally {
      store.refreshing = false;
    }
  }

  const round2 = (v) => Math.round(v * 100) / 100;

  // Lightweight price tick between full refreshes: updates just price / change%
  // / change-since-open so the numbers move more often. In live mode this is a
  // quote-only fetch per ticker; in mock it applies a small random walk so the
  // board visibly ticks. Full signal/news recompute stays on refreshAll.
  async function tickPrices({ spacingMs = 0 } = {}) {
    if (store.refreshing) return; // don't collide with a full refresh
    for (const ticker of provider.tickers) {
      const cur = store.stocks[ticker];
      if (!cur) continue;
      let price = cur.price;
      if (provider.mode === "mock") {
        price = round2(cur.price * (1 + (Math.random() - 0.5) * 0.0025));
      } else {
        try { price = (await provider.quote(ticker)).price; } catch { continue; }
        if (spacingMs) await new Promise((r) => setTimeout(r, spacingMs));
      }
      if (!price) continue;
      cur.price = price;
      if (cur.prevClose) cur.changePercent = round2(((price - cur.prevClose) / cur.prevClose) * 100);
      if (cur.open > 0) cur.changeFromOpen = round2(((price - cur.open) / cur.open) * 100);
      if (cur.timeframes?.daily) cur.timeframes.daily.changePercent = cur.changePercent;
    }
    store.lastUpdated = new Date().toISOString();
  }

  return { store, refreshAll, refreshOne, tickPrices, scoreText };
}
