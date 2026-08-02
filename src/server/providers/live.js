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

    // Finnhub's basic quote lacks volume; approximate spike from candle data
    // if available, otherwise leave avgVolume 0 (signal engine handles it).
    let currentVolume = 0;
    let avgVolume = 0;
    let sentimentScore = 0;
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - 30 * 24 * 3600;
      const cRes = await fetchImpl(
        `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${now}&token=${finnhubKey}`
      );
      const c = await cRes.json();
      if (c.s === "ok" && Array.isArray(c.v) && c.v.length) {
        currentVolume = c.v[c.v.length - 1];
        avgVolume = Math.round(c.v.reduce((a, b) => a + b, 0) / c.v.length);
      }
    } catch { /* volume is best-effort */ }

    return {
      price,
      changePercent: round2(changePercent),
      high: d.h ?? 0,
      low: d.l ?? 0,
      open: d.o ?? 0,
      prevClose,
      currentVolume,
      avgVolume,
      sentimentScore,
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

  return { mode: "live", tickers: TICKERS, quote, news, tick() {} };
}
