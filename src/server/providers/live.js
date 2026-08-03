// ─── Live Data Provider ─────────────────────────────────────────
// Real Finnhub (quotes + company news) with NewsAPI as a headline
// fallback. Only constructed when DATA_MODE=live AND the required keys
// are present, so it never runs (or spends) during tests.

import { TICKERS, companyName } from "../universe.js";
import { scoreText } from "../signal.js";

const round2 = (v) => Math.round(v * 100) / 100;

export function makeLiveProvider({ finnhubKey, newsApiKey, fetchImpl = fetch }) {
  if (!finnhubKey) {
    throw new Error("DATA_MODE=live requires FINNHUB_KEY in the environment.");
  }

  async function quote(ticker) {
    const res = await fetchImpl(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`
    );
    const d = await res.json();
    const price = round2(d.c ?? 0);
    const prevClose = d.pc ?? 0;
    const changePercent = prevClose ? ((d.c - prevClose) / prevClose) * 100 : 0;

    // Finnhub's free tier provides neither intraday volume (the /stock/candle
    // endpoint 403s) nor news sentiment, so we leave those neutral. The signal
    // is then driven by real price momentum + real news headlines. Volume and
    // sentiment become available automatically on a paid plan.
    return {
      price,
      changePercent: round2(changePercent),
      high: d.h ?? 0,
      low: d.l ?? 0,
      open: d.o ?? 0,
      prevClose,
      currentVolume: 0,
      avgVolume: 0,
      sentimentScore: 0,
      sentimentAvailable: false, // Finnhub free tier has no news sentiment
    };
  }

  async function news(ticker) {
    // Prefer Finnhub company-news (no extra key needed).
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10);
      const res = await fetchImpl(
        `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${finnhubKey}`
      );
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length) {
        return arr.slice(0, 6).map((n) => ({
          headline: n.headline,
          source: n.source,
          url: n.url,
          sentiment: scoreText(n.headline + " " + (n.summary ?? "")),
          publishedAt: n.datetime ? new Date(n.datetime * 1000).toISOString() : null,
        }));
      }
    } catch { /* fall through to NewsAPI */ }

    if (newsApiKey) {
      try {
        const res = await fetchImpl(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(companyName(ticker))}&sortBy=publishedAt&pageSize=6&language=en&apiKey=${newsApiKey}`
        );
        const data = await res.json();
        return (data.articles ?? []).map((a) => ({
          headline: a.title,
          source: a.source?.name ?? "News",
          url: a.url,
          sentiment: scoreText(a.title + " " + (a.description ?? "")),
          publishedAt: a.publishedAt ?? null,
        }));
      } catch { /* give up gracefully */ }
    }
    return [];
  }

  // Real weekly/monthly changes from Yahoo Finance's chart endpoint (free,
  // no key — Finnhub's free tier has no history). Daily stays from the live
  // Finnhub quote. Anchored on the current price vs past daily closes.
  async function changes(ticker, price, dailyChange) {
    const out = { daily: dailyChange, weekly: null, monthly: null, series: [] };
    try {
      const res = await fetchImpl(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const rawCloses = r?.indicators?.quote?.[0]?.close ?? [];
      const series = [];
      for (let i = 0; i < rawCloses.length; i++) {
        if (rawCloses[i] != null) series.push({ t: ts[i] * 1000, close: round2(rawCloses[i]) });
      }
      // End the series on the current (intraday) price for a live-looking chart.
      if (price) series.push({ t: Date.now(), close: price });
      out.series = series;

      const closes = series.map((p) => p.close);
      if (closes.length >= 7) {
        const wk = closes[closes.length - 7]; // ~5 trading days back (excl. the appended point)
        out.weekly = round2(((price - wk) / wk) * 100);
      }
      if (closes.length >= 2) {
        const mo = closes[0]; // ~1 month back
        out.monthly = round2(((price - mo) / mo) * 100);
      }
    } catch { /* leave weekly/monthly null → falls back to daily in the UI */ }
    return out;
  }

  return { mode: "live", tickers: TICKERS, quote, news, changes, tick() {} };
}
