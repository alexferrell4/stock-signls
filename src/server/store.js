// ─── In-memory Store + Refresh Pipeline ─────────────────────────
// Holds the latest computed signals, news, and a short intraday score
// history per ticker (feeds the modal chart). Durable snapshots + the
// historical track record are persisted via the injected `db` (SQLite).

import { computeSignal, scoreText } from "./signal.js";
import { companyName } from "./universe.js";

const HISTORY_LEN = 60; // keep last N score points per ticker

// A no-op persistence layer so the store works with or without a DB
// (e.g. Phase 0/1 tests that don't care about the track record).
const NO_DB = { recordSnapshot() {}, evaluatePending() { return 0; } };

export function createStore({ provider, ai, db = NO_DB }) {
  const store = {
    stocks: {},        // ticker -> enriched signal object
    news: {},          // ticker -> [news items]
    history: {},       // ticker -> [{ time, score, signal }]
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

    const sig = computeSignal({
      changePercent: quote.changePercent,
      currentVolume: quote.currentVolume,
      avgVolume: quote.avgVolume,
      sentimentScore: quote.sentimentScore,
      newsItems: news,
    });

    const analysis = await ai.generateAnalysis({
      ticker,
      company: companyName(ticker),
      quote,
      signal: sig,
      news,
    });

    const stock = {
      ticker,
      company: companyName(ticker),
      price: quote.price,
      changePercent: quote.changePercent,
      high: quote.high,
      low: quote.low,
      open: quote.open,
      volume: quote.currentVolume,
      avgVolume: quote.avgVolume,
      finnhubSentiment: quote.sentimentScore,
      ...sig,
      aiAnalysis: analysis,
      updatedAt: new Date().toISOString(),
    };

    store.stocks[ticker] = stock;
    store.news[ticker] = news;
    pushHistory(ticker, sig.score, sig.signal);
    return stock;
  }

  // Refresh the whole universe. Spaced out to respect rate limits in live
  // mode; in mock mode the sleep is harmless and keeps timing realistic.
  async function refreshAll({ spacingMs = 0 } = {}) {
    if (store.refreshing) return;
    store.refreshing = true;
    store.lastError = null;
    try {
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

      provider.tick?.();
      store.lastUpdated = nowIso;
    } finally {
      store.refreshing = false;
    }
  }

  return { store, refreshAll, refreshOne, scoreText };
}
