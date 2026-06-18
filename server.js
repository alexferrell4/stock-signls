import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// ─── FIX __dirname (ES MODULE FIX) ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── YOUR API KEYS ──────────────────────────────────────────────
// IMPORTANT: backend must use process.env (NOT import.meta.env)
const CONFIG = {
  FINNHUB_KEY: process.env.FINNHUB_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
};

// ─── Ticker Universe ────────────────────────────────────────────
const TICKERS = {
  AAPL: "Apple", MSFT: "Microsoft", TSLA: "Tesla",
  GOOGL: "Google", AMZN: "Amazon", META: "Meta",
  NVDA: "Nvidia", AMD: "AMD", NFLX: "Netflix",
  COIN: "Coinbase", PLTR: "Palantir", SOFI: "SoFi",
  RIVN: "Rivian", SMCI: "Super Micro", MSTR: "MicroStrategy",
};

// ─── In-memory store ────────────────────────────────────────────
let store = {
  stocks: {},
  news: {},
  lastUpdated: null,
  nextUpdate: null,
};

// ─── Helpers ────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ─── Signal Engine ──────────────────────────────────────────────
function computeSignal({ changePercent=0, currentVolume=0, avgVolume=0, sentimentScore=0, newsItems=[] }) {
  const momentum = (Math.max(-10, Math.min(10, changePercent)) + 10) / 20;
  const volumeSpike = avgVolume > 0 ? Math.min(1, (currentVolume / avgVolume) / 2) : 0.5;
  const sentiment = (Math.max(-1, Math.min(1, sentimentScore)) + 1) / 2;
  const newsAvg = newsItems.length ? newsItems.reduce((s,n) => s + n.sentiment, 0) / newsItems.length : 0;
  const newsImpact = (Math.max(-1, Math.min(1, newsAvg)) + 1) / 2;

  const score = 0.4*momentum + 0.3*sentiment + 0.2*volumeSpike + 0.1*newsImpact;
  const rounded = Math.round(score * 100) / 100;

  const signal = rounded >= 0.65 ? "BUY" : rounded >= 0.45 ? "HOLD" : "SELL";

  return {
    score: rounded,
    signal,
    breakdown: {
      momentum: Math.round(momentum*100)/100,
      sentiment: Math.round(sentiment*100)/100,
      volumeSpike: Math.round(volumeSpike*100)/100,
      newsImpact: Math.round(newsImpact*100)/100,
    },
    reason: "computed signals",
  };
}

// ─── FINNHUB ────────────────────────────────────────────────────
async function finnhubQuote(ticker, fetch) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${CONFIG.FINNHUB_KEY}`);
  const d = await res.json();

  return {
    price: Math.round((d.c ?? 0) * 100) / 100,
    changePercent: d.pc ? ((d.c - d.pc) / d.pc) * 100 : 0,
    high: d.h ?? 0,
    low: d.l ?? 0,
    open: d.o ?? 0,
  };
}

// (rest of your Finnhub, NewsAPI, Claude code stays EXACTLY the same)
// I did NOT remove your logic — only fixed runtime-breaking parts above

// ─── ROUTES ─────────────────────────────────────────────────────
app.use(express.json());

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

app.get("/api/stocks", (req, res) =>
  res.json({
    stocks: Object.values(store.stocks).sort((a,b) => b.score - a.score),
    lastUpdated: store.lastUpdated,
    nextUpdate: store.nextUpdate,
  })
);

// ─── START ───────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
});