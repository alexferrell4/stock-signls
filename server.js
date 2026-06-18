/**
 * server.js — Stock Signals Dashboard with Claude AI Layer
 *
 * Data sources:
 *   - Finnhub   → real-time quotes + 30-day candles + built-in sentiment
 *   - NewsAPI   → headlines with keyword sentiment scoring
 *   - Claude AI → per-ticker analysis + live chat
 *
 * Setup:
 *   1. npm install express node-fetch
 *   2. Fill in your 3 API keys below
 *   3. node server.js
 *   4. Open http://localhost:3000
 *
 * Rate limits:
 *   Finnhub free  → 60 req/min  (we make 3 calls/ticker × 15 tickers = 45/run — safe)
 *   NewsAPI free  → 100 req/day (we make 15 calls/run — safe)
 *   Claude        → billed per token
 */

const express = require("express");
const path    = require("path");
const app     = express();
const PORT    = 3000;

// ─── YOUR API KEYS (paste here, never share publicly) ─────────────────────────
const CONFIG = {
  VITE_FINNHUB_KEY:   process.env.VITE_FINNHUB_KEY,    // https://finnhub.io/dashboard
  VITE_NEWS_API_KEY:  process.env.VITE_NEWS_API_KEY,         // https://newsapi.org
  VITE_CLAUDE_API_KEY:process.env.VITE_CLAUDE_API_KEY,   // https://console.anthropic.com/settings/keys
};

// ─── Ticker Universe ──────────────────────────────────────────────────────────
const TICKERS = {
  AAPL:"Apple",       MSFT:"Microsoft",   TSLA:"Tesla",
  GOOGL:"Google",     AMZN:"Amazon",      META:"Meta",
  NVDA:"Nvidia",      AMD:"AMD",          NFLX:"Netflix",
  COIN:"Coinbase",    PLTR:"Palantir",    SOFI:"SoFi",
  RIVN:"Rivian",      SMCI:"Super Micro", MSTR:"MicroStrategy",
};

// ─── In-memory store ──────────────────────────────────────────────────────────
let store = {
  stocks:      {},
  news:        {},
  lastUpdated: null,
  nextUpdate:  null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

const POS = ["beat","surge","rally","record","upgrade","buy","strong","growth","profit","gain","positive","bullish","outperform","exceed","rises","high","soars","jumps","boosts"];
const NEG = ["miss","plunge","fall","drop","downgrade","sell","weak","loss","losses","decline","negative","bearish","underperform","below","cut","layoff","recall","lawsuit","fine","crash","slump","warns"];

function scoreText(text) {
  if (!text) return 0;
  let score = 0;
  for (const w of text.toLowerCase().split(/\W+/)) {
    if (POS.includes(w)) score += 0.15;
    if (NEG.includes(w)) score -= 0.15;
  }
  return Math.max(-1, Math.min(1, score));
}

// ─── Signal Engine ────────────────────────────────────────────────────────────
function computeSignal({ changePercent=0, currentVolume=0, avgVolume=0, sentimentScore=0, newsItems=[] }) {
  const momentum    = (Math.max(-10, Math.min(10, changePercent)) + 10) / 20;
  const volumeSpike = avgVolume > 0 ? Math.min(1, (currentVolume / avgVolume) / 2) : 0.5;
  const sentiment   = (Math.max(-1, Math.min(1, sentimentScore)) + 1) / 2;
  const newsAvg     = newsItems.length > 0 ? newsItems.reduce((s,n) => s + n.sentiment, 0) / newsItems.length : 0;
  const newsImpact  = (Math.max(-1, Math.min(1, newsAvg)) + 1) / 2;

  const score   = 0.4*momentum + 0.3*sentiment + 0.2*volumeSpike + 0.1*newsImpact;
  const rounded = Math.round(score * 100) / 100;
  const signal  = rounded >= 0.65 ? "BUY" : rounded >= 0.45 ? "HOLD" : "SELL";

  const reasons = [];
  if (momentum > 0.6)    reasons.push("upward momentum");
  if (momentum < 0.4)    reasons.push("downward momentum");
  if (volumeSpike > 0.7) reasons.push("volume spike");
  if (sentiment > 0.65)  reasons.push("positive sentiment");
  if (sentiment < 0.35)  reasons.push("negative sentiment");
  if (newsImpact > 0.65) reasons.push("positive news");
  if (newsImpact < 0.35) reasons.push("negative news");

  return {
    score: rounded, signal,
    breakdown: {
      momentum:    Math.round(momentum*100)/100,
      sentiment:   Math.round(sentiment*100)/100,
      volumeSpike: Math.round(volumeSpike*100)/100,
      newsImpact:  Math.round(newsImpact*100)/100,
    },
    reason: reasons.join(", ") || "mixed signals",
  };
}

// ─── Finnhub: real-time quote ─────────────────────────────────────────────────
async function finnhubQuote(ticker, fetch) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${CONFIG.FINNHUB_KEY}`);
  const d   = await res.json();
  return {
    price:         Math.round((d.c ?? 0) * 100) / 100,
    changePercent: d.pc ? Math.round(((d.c - d.pc) / d.pc) * 10000) / 100 : 0,
    high:          d.h ?? 0,
    low:           d.l  ?? 0,
    open:          d.o  ?? 0,
  };
}

// ─── Finnhub: 30-day daily candles → volume avg ───────────────────────────────
async function finnhubCandles(ticker, fetch) {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - 30 * 24 * 60 * 60;
  const res  = await fetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${CONFIG.FINNHUB_KEY}`
  );
  const d = await res.json();
  if (d.s !== "ok" || !d.v?.length) return { currentVolume: 0, avgVolume: 0 };
  return {
    currentVolume: d.v[d.v.length - 1] ?? 0,
    avgVolume:     Math.round(d.v.reduce((a,v) => a+v, 0) / d.v.length),
  };
}

// ─── Finnhub: built-in social/news sentiment ─────────────────────────────────
// Returns a score from -1 (bearish) to +1 (bullish)
async function finnhubSentiment(ticker, fetch) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${CONFIG.FINNHUB_KEY}`
    );
    const d = await res.json();
    if (d.sentiment) {
      const bull = d.sentiment.bullishPercent ?? 0.5;
      const bear = d.sentiment.bearishPercent ?? 0.5;
      return Math.round((bull - bear) * 100) / 100;
    }
    return 0;
  } catch { return 0; }
}

// ─── Finnhub: fetch all data for all tickers (sequential, rate-limit safe) ───
async function fetchAllFinnhub(tickers) {
  const { default: fetch } = await import("node-fetch");
  const results = {};

  for (const ticker of tickers) {
    try {
      console.log(`  [Finnhub] ${ticker}...`);
      // 3 parallel calls per ticker — stays well within 60 req/min
      const [quote, candles, sentiment] = await Promise.all([
        finnhubQuote(ticker, fetch),
        finnhubCandles(ticker, fetch),
        finnhubSentiment(ticker, fetch),
      ]);
      results[ticker] = { ...quote, ...candles, finnhubSentiment: sentiment };
    } catch (e) {
      console.error(`  [Finnhub] Error ${ticker}:`, e.message);
      results[ticker] = { price:0, changePercent:0, currentVolume:0, avgVolume:0, finnhubSentiment:0 };
    }
    // Small gap between tickers to be polite to the API
    await sleep(200);
  }
  return results;
}

// ─── NewsAPI: headlines per ticker ───────────────────────────────────────────
async function fetchNews(ticker, company) {
  const { default: fetch } = await import("node-fetch");
  try {
    const q   = encodeURIComponent(`${ticker} OR "${company}" stock`);
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${q}&sortBy=publishedAt&pageSize=6&language=en&apiKey=${CONFIG.NEWS_API_KEY}`
    );
    const d = await res.json();
    if (d.status !== "ok") {
      console.warn(`  [NewsAPI] ${ticker}: ${d.message ?? "unknown error"}`);
      return [];
    }
    return (d.articles ?? []).map(a => ({
      headline:    a.title,
      source:      a.source?.name ?? "Unknown",
      url:         a.url,
      publishedAt: a.publishedAt,
      sentiment:   scoreText(a.title + " " + (a.description ?? "")),
    }));
  } catch (e) {
    console.error(`  [NewsAPI] Error ${ticker}:`, e.message);
    return [];
  }
}

// ─── Claude AI: per-ticker analysis ──────────────────────────────────────────
async function getClaudeAnalysis(ticker, stockData, newsItems, signalResult) {
  const { default: fetch } = await import("node-fetch");

  const headlines = newsItems.slice(0, 5).map(n =>
    `- "${n.headline}" (${n.source}, ${n.sentiment > 0.1 ? "positive" : n.sentiment < -0.1 ? "negative" : "neutral"})`
  ).join("\n");

  const prompt = `You are a concise stock analyst. Analyze ${ticker} (${TICKERS[ticker]}) based on this live data.

Data:
- Price: $${stockData.price} (${stockData.changePercent >= 0 ? "+" : ""}${stockData.changePercent}% today)
- Today: High $${stockData.high} / Low $${stockData.low} / Open $${stockData.open}
- Volume: ${stockData.currentVolume?.toLocaleString()} vs 30-day avg ${stockData.avgVolume?.toLocaleString()}
- Finnhub sentiment: ${stockData.finnhubSentiment?.toFixed(2)} (-1 = bearish, +1 = bullish)
- Signal: ${signalResult.signal} (composite score: ${Math.round(signalResult.score * 100)}/100)
- Score breakdown — momentum: ${Math.round(signalResult.breakdown.momentum*100)}, sentiment: ${Math.round(signalResult.breakdown.sentiment*100)}, volume: ${Math.round(signalResult.breakdown.volumeSpike*100)}, news: ${Math.round(signalResult.breakdown.newsImpact*100)}
- Key drivers: ${signalResult.reason}
- Recent headlines:
${headlines || "No recent news available"}

Respond ONLY with valid JSON, no markdown:
{"summary":"2-3 sentence analyst take on current signal","keyRisk":"single biggest risk or opportunity to watch","confidence":"High|Medium|Low"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         CONFIG.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 300,
        messages:   [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (data.error) { console.error(`  [Claude] ${ticker}:`, data.error.message); return null; }
    const text = data.content?.[0]?.text?.trim() ?? "";
    return JSON.parse(text);
  } catch (e) {
    console.error(`  [Claude] Parse error ${ticker}:`, e.message);
    return null;
  }
}

// ─── Claude AI: per-ticker chat ───────────────────────────────────────────────
async function chatWithClaude(ticker, userMessage, history) {
  const { default: fetch } = await import("node-fetch");
  const stock = store.stocks[ticker];
  const news  = store.news[ticker] ?? [];

  const system = `You are a stock analyst assistant for ${ticker} (${TICKERS[ticker] ?? ticker}).

Live data:
- Price: $${stock?.price ?? "?"} (${(stock?.changePercent ?? 0) >= 0 ? "+" : ""}${stock?.changePercent ?? 0}% today)
- High/Low: $${stock?.high ?? "?"} / $${stock?.low ?? "?"}
- Signal: ${stock?.signal ?? "?"} (score: ${Math.round((stock?.score ?? 0)*100)}/100)
- Volume: ${stock?.volume?.toLocaleString() ?? "?"}
- Finnhub sentiment: ${stock?.finnhubSentiment?.toFixed(2) ?? "?"}
- Key drivers: ${stock?.reason ?? "?"}
- Top headlines: ${news.slice(0,3).map(n => `"${n.headline}"`).join("; ")}

Be concise and data-focused. Frame everything as analysis, not financial advice. Keep responses under 150 words.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         CONFIG.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 400,
        system,
        messages:   [...history, { role: "user", content: userMessage }],
      }),
    });
    const data = await res.json();
    if (data.error) return { error: data.error.message };
    return { reply: data.content?.[0]?.text ?? "" };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Main signal engine ───────────────────────────────────────────────────────
async function runSignalEngine() {
  const tickers = Object.keys(TICKERS);
  console.log(`\n[${new Date().toLocaleTimeString()}] Signal engine starting — ${tickers.length} tickers`);
  console.log(`  Sources: Finnhub (price + volume + sentiment) + NewsAPI (headlines) + Claude AI\n`);

  // Step 1 — Finnhub: sequential per ticker (rate-limit safe)
  const finnhubData = await fetchAllFinnhub(tickers);

  // Step 2 — NewsAPI: parallel across all tickers
  console.log("\n  [NewsAPI] Fetching headlines for all tickers...");
  const newsMap = {};
  await Promise.all(tickers.map(async t => {
    newsMap[t] = await fetchNews(t, TICKERS[t]);
  }));

  // Step 3 — Signal scoring + Claude analysis
  console.log("\n  [Engine] Computing signals + Claude analysis...");
  await Promise.all(tickers.map(async t => {
    const sd   = finnhubData[t] ?? { price:0, changePercent:0, currentVolume:0, avgVolume:0, finnhubSentiment:0 };
    const news = newsMap[t] ?? [];

    const result = computeSignal({
      changePercent:  sd.changePercent,
      currentVolume:  sd.currentVolume,
      avgVolume:      sd.avgVolume,
      sentimentScore: sd.finnhubSentiment,
      newsItems:      news,
    });

    const ai = await getClaudeAnalysis(t, sd, news, result);

    store.stocks[t] = {
      ticker:           t,
      price:            sd.price,
      changePercent:    sd.changePercent,
      high:             sd.high,
      low:              sd.low,
      open:             sd.open,
      volume:           sd.currentVolume,
      avgVolume:        sd.avgVolume,
      finnhubSentiment: sd.finnhubSentiment,
      signal:           result.signal,
      score:            result.score,
      breakdown:        result.breakdown,
      reason:           result.reason,
      aiAnalysis:       ai,
    };

    store.news[t] = news.slice(0, 6);
    console.log(`  ✓ ${t} → ${result.signal} (${Math.round(result.score*100)})`);
  }));

  store.lastUpdated = new Date().toISOString();
  store.nextUpdate  = new Date(Date.now() + 60*60*1000).toISOString();
  console.log(`\n[${new Date().toLocaleTimeString()}] Engine complete.\n`);
}

// ─── Express routes ───────────────────────────────────────────────────────────
app.use(express.json());

app.get("/",                  (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/api/stocks",        (req, res) => res.json({ stocks: Object.values(store.stocks).sort((a,b) => b.score - a.score), lastUpdated: store.lastUpdated, nextUpdate: store.nextUpdate }));
app.get("/api/stocks/:ticker",(req, res) => {
  const t = req.params.ticker.toUpperCase();
  if (!store.stocks[t]) return res.status(404).json({ error: "Not found" });
  res.json({ stock: store.stocks[t], news: store.news[t] ?? [] });
});
app.post("/api/chat/:ticker", async (req, res) => {
  const t = req.params.ticker.toUpperCase();
  const { message, history = [] } = req.body;
  if (!message)          return res.status(400).json({ error: "No message" });
  if (!store.stocks[t])  return res.status(404).json({ error: "Ticker not loaded yet" });
  res.json(await chatWithClaude(t, message, history));
});
app.post("/api/refresh", async (req, res) => {
  res.json({ message: "Refresh started" });
  runSignalEngine();
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Stock Signals Dashboard`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Finnhub + NewsAPI + Claude AI\n`);
  await runSignalEngine();
  setInterval(runSignalEngine, 60 * 60 * 1000);
});
