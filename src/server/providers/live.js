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

  const FH = (path) => `https://finnhub.io/api/v1${path}${path.includes("?") ? "&" : "?"}token=${finnhubKey}`;

  // Small TTL cache so slow-moving data (recommendations, fundamentals, market
  // news) isn't refetched every 5-minute cycle — keeps us under the free-tier
  // rate limit while still using every endpoint the plan allows.
  const cache = new Map();
  async function cached(key, ttlMs, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < ttlMs) return hit.v;
    const v = await fn();
    cache.set(key, { t: Date.now(), v });
    return v;
  }
  const getJson = async (url) => { try { const r = await fetchImpl(url); return await r.json(); } catch { return null; } };

  // Latest analyst recommendation counts → a real sentiment score in [-1,1].
  async function recommendation(ticker) {
    return cached(`rec:${ticker}`, 60 * 60_000, async () => {
      const arr = await getJson(FH(`/stock/recommendation?symbol=${ticker}`));
      return Array.isArray(arr) && arr.length ? arr[0] : null; // newest period first
    });
  }
  function recToSentiment(rec) {
    if (!rec) return { score: 0, available: false };
    const total = (rec.strongBuy || 0) + (rec.buy || 0) + (rec.hold || 0) + (rec.sell || 0) + (rec.strongSell || 0);
    if (!total) return { score: 0, available: false };
    const raw = ((rec.strongBuy || 0) + 0.5 * (rec.buy || 0) - 0.5 * (rec.sell || 0) - (rec.strongSell || 0)) / total;
    return { score: Math.max(-1, Math.min(1, round2(raw))), available: true };
  }

  async function quote(ticker) {
    const res = await fetchImpl(FH(`/quote?symbol=${ticker}`));
    const d = await res.json();
    const price = round2(d.c ?? 0);
    const prevClose = d.pc ?? 0;
    const changePercent = prevClose ? ((d.c - prevClose) / prevClose) * 100 : 0;

    // Sentiment now comes from real analyst recommendations. Volume is filled
    // from the Yahoo history call (see changes()). Only intraday candles remain
    // premium-only on Finnhub's free plan.
    const sent = recToSentiment(await recommendation(ticker));
    return {
      price,
      changePercent: round2(changePercent),
      high: d.h ?? 0,
      low: d.l ?? 0,
      open: d.o ?? 0,
      prevClose,
      currentVolume: 0,
      avgVolume: 0,
      sentimentScore: sent.score,
      sentimentAvailable: sent.available,
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
    const out = { daily: dailyChange, weekly: null, monthly: null, series: [], currentVolume: 0, avgVolume: 0 };
    try {
      const res = await fetchImpl(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const q = r?.indicators?.quote?.[0] ?? {};
      const rawCloses = q.close ?? [];
      const series = [];
      for (let i = 0; i < rawCloses.length; i++) {
        if (rawCloses[i] == null) continue;
        series.push({
          t: ts[i] * 1000,
          open: round2(q.open?.[i] ?? rawCloses[i]),
          high: round2(q.high?.[i] ?? rawCloses[i]),
          low: round2(q.low?.[i] ?? rawCloses[i]),
          close: round2(rawCloses[i]),
        });
      }
      // End the series on the current (intraday) price for a live-looking chart.
      if (price) series.push({ t: Date.now(), open: price, high: price, low: price, close: price });
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

      // Volume from the same response → makes the signal's volume component
      // real (today's volume vs the ~month average), no extra request.
      const vols = (r?.indicators?.quote?.[0]?.volume ?? []).filter((x) => x != null);
      if (vols.length) {
        out.avgVolume = Math.round(vols.reduce((a, b) => a + b, 0) / vols.length);
        out.currentVolume = r?.meta?.regularMarketVolume ?? vols[vols.length - 1];
      }
    } catch { /* leave nulls → falls back to daily / neutral volume */ }
    return out;
  }

  // Premarket high/low from Yahoo intraday (pre/post bars before the regular open).
  async function premarketLevels(ticker) {
    try {
      const res = await fetchImpl(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m&includePrePost=true`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      const regStart = r?.meta?.currentTradingPeriod?.regular?.start;
      const ts = r?.timestamp ?? [];
      const q = r?.indicators?.quote?.[0] ?? {};
      let hi = null, lo = null;
      for (let i = 0; i < ts.length; i++) {
        if (regStart && ts[i] >= regStart) break; // stop at the regular open
        if (q.high?.[i] != null) hi = hi == null ? q.high[i] : Math.max(hi, q.high[i]);
        if (q.low?.[i] != null) lo = lo == null ? q.low[i] : Math.min(lo, q.low[i]);
      }
      return hi != null && lo != null ? { high: round2(hi), low: round2(lo) } : null;
    } catch { return null; }
  }

  // Everything the free tier exposes for a company, fetched on demand (modal).
  async function fundamentals(ticker) {
    return cached(`fund:${ticker}`, 30 * 60_000, async () => {
      const [profile, metricRes, rec, earnings, peers, cal, insider, premarket] = await Promise.all([
        getJson(FH(`/stock/profile2?symbol=${ticker}`)),
        getJson(FH(`/stock/metric?symbol=${ticker}&metric=all`)),
        recommendation(ticker),
        getJson(FH(`/stock/earnings?symbol=${ticker}`)),
        getJson(FH(`/stock/peers?symbol=${ticker}`)),
        getJson(FH(`/calendar/earnings?symbol=${ticker}`)),
        getJson(FH(`/stock/insider-transactions?symbol=${ticker}`)),
        premarketLevels(ticker),
      ]);
      const m = metricRes?.metric ?? {};
      const insiderNet = (insider?.data ?? []).slice(0, 30).reduce((a, t) => a + (t.change || 0), 0);
      return {
        profile: profile ? {
          name: profile.name, industry: profile.finnhubIndustry, exchange: profile.exchange,
          country: profile.country, ipo: profile.ipo, logo: profile.logo, weburl: profile.weburl,
          marketCap: profile.marketCapitalization, shareOutstanding: profile.shareOutstanding,
        } : null,
        metrics: {
          high52: m["52WeekHigh"] ?? null, low52: m["52WeekLow"] ?? null,
          pe: m.peTTM ?? m.peBasicExclExtraTTM ?? null, beta: m.beta ?? null,
          ret13w: m["13WeekPriceReturnDaily"] ?? null, ret52w: m["52WeekPriceReturnDaily"] ?? null,
          grossMargin: m.grossMarginTTM ?? null, netMargin: m.netProfitMarginTTM ?? null,
          divYield: m.currentDividendYieldTTM ?? null, roe: m.roeTTM ?? null,
        },
        recommendation: rec ? { strongBuy: rec.strongBuy, buy: rec.buy, hold: rec.hold, sell: rec.sell, strongSell: rec.strongSell, period: rec.period } : null,
        lastEarnings: Array.isArray(earnings) && earnings[0]
          ? { period: earnings[0].period, estimate: earnings[0].estimate, actual: earnings[0].actual, surprisePercent: earnings[0].surprisePercent }
          : null,
        nextEarnings: cal?.earningsCalendar?.[0] ? { date: cal.earningsCalendar[0].date, epsEstimate: cal.earningsCalendar[0].epsEstimate } : null,
        peers: Array.isArray(peers) ? peers.filter((p) => p !== ticker).slice(0, 8) : [],
        insiderNet,
        premarket,
      };
    });
  }

  // General business market news (NewsAPI), for the dashboard feed.
  async function marketNews() {
    return cached("marketnews", 10 * 60_000, async () => {
      if (!newsApiKey) return [];
      const j = await getJson(`https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=12&apiKey=${newsApiKey}`);
      return (j?.articles ?? []).map((a) => ({
        title: a.title, source: a.source?.name ?? "News", url: a.url,
        publishedAt: a.publishedAt, image: a.urlToImage ?? null,
      }));
    });
  }

  // On-demand price series matching the timeframe, via Yahoo's chart endpoint
  // with the appropriate range/interval. Returns [] on failure (UI hides chart).
  async function chartSeries(ticker, timeframe) {
    const [range, interval] = ({
      daily: ["1d", "5m"],
      weekly: ["5d", "30m"],
      monthly: ["1mo", "1d"],
    }[timeframe]) ?? ["1mo", "1d"];
    try {
      const res = await fetchImpl(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const q = r?.indicators?.quote?.[0] ?? {};
      const cl = q.close ?? [];
      const series = [];
      for (let i = 0; i < cl.length; i++) {
        if (cl[i] == null) continue;
        series.push({
          t: ts[i] * 1000,
          open: round2(q.open?.[i] ?? cl[i]),
          high: round2(q.high?.[i] ?? cl[i]),
          low: round2(q.low?.[i] ?? cl[i]),
          close: round2(cl[i]),
        });
      }
      return series;
    } catch { return []; }
  }

  return { mode: "live", tickers: TICKERS, quote, news, changes, chartSeries, fundamentals, marketNews, tick() {} };
}
