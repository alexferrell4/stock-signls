// ─── Trendline API server ───────────────────────────────────────
// Express backend that runs the signal pipeline and serves the React app.
//
// Modes (env):
//   DATA_MODE = mock (default) | live      — market data source
//   AI_MODE   = mock (default) | live      — Claude analysis/chat/advisor
//
// Mock is the default everywhere, so `node server.js` and the whole test
// suite run with ZERO API keys and ZERO credit spend. Flip to live only
// when you want real markets: DATA_MODE=live AI_MODE=live node server.js

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { makeProvider } from "./src/server/providers/index.js";
import { makeAI } from "./src/server/ai.js";
import { createStore } from "./src/server/store.js";
import { createDb } from "./src/server/db.js";
import { buildPortfolio } from "./src/server/portfolio.js";
import { makeAlertChannel } from "./src/server/alerts.js";
import { UNIVERSE, TICKERS, companyName } from "./src/server/universe.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Build the app (exported for tests) ─────────────────────────
export function buildApp(env = process.env) {
  const provider = makeProvider(env);
  const ai = makeAI(env);
  const db = createDb(env);
  const channel = makeAlertChannel(env);
  const { store, refreshAll } = createStore({ provider, ai, db, channel });

  const REFRESH_MIN = Number(env.REFRESH_MINUTES ?? 5);
  const spacingMs = provider.mode === "live" ? 1100 : 0; // rate-limit live calls

  const app = express();
  app.use(express.json());

  // Health / status — standard for any deployable service.
  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      dataMode: provider.mode,
      aiMode: ai.mode,
      persistence: db.enabled ? "sqlite" : "none",
      tracking: TICKERS.length,
      lastUpdated: store.lastUpdated,
      lastError: store.lastError,
    });
  });

  // Universe metadata (symbols + company names) for client-side search.
  app.get("/api/meta", (req, res) => {
    res.json({ universe: UNIVERSE, tickers: TICKERS, refreshMinutes: REFRESH_MIN, dataMode: provider.mode });
  });

  // Symbol/company search across the tracked universe.
  app.get("/api/search", (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.json({ results: [] });
    const results = TICKERS.filter(
      (t) => t.toLowerCase().includes(q) || companyName(t).toLowerCase().includes(q)
    ).map((t) => ({ ticker: t, company: companyName(t), stock: store.stocks[t] ?? null }));
    res.json({ results });
  });

  // All signals, best score first. Each carries a short `spark` series
  // (recent score history) so cards/rows can render a sparkline.
  app.get("/api/stocks", (req, res) => {
    const stocks = Object.values(store.stocks)
      .map((s) => ({ ...s, spark: (store.history[s.ticker] ?? []).map((h) => h.score) }))
      .sort((a, b) => b.score - a.score);
    res.json({
      stocks,
      lastUpdated: store.lastUpdated,
      nextUpdate: store.nextUpdate,
      dataMode: provider.mode,
    });
  });

  // One stock + its news + intraday score history (feeds the modal).
  app.get("/api/stocks/:ticker", (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const stock = store.stocks[ticker];
    if (!stock) return res.status(404).json({ error: `No data for ${ticker}` });
    res.json({
      stock,
      news: store.news[ticker] ?? [],
      history: store.history[ticker] ?? [],
      priceHistory: store.priceHistory[ticker] ?? [],
    });
  });

  // Price series for the modal chart, range matched to the timeframe
  // (intraday / 5-day / 1-month). Fetched on demand so it's always fresh.
  // ?compare=1 also returns the S&P 500 series for a relative overlay.
  const INDEX = { symbol: "^GSPC", name: "S&P 500", mockBase: 5200 };
  app.get("/api/stocks/:ticker/chart", async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const tf = ["daily", "weekly", "monthly"].includes(req.query.tf) ? req.query.tf : "daily";
    const price = store.stocks[ticker]?.price ?? 0;
    const series = provider.chartSeries ? await provider.chartSeries(ticker, tf, price) : [];
    const out = { ticker, timeframe: tf, series };
    if (req.query.compare && provider.chartSeries) {
      const idx = await provider.chartSeries(INDEX.symbol, tf, INDEX.mockBase);
      out.index = { symbol: INDEX.symbol, name: INDEX.name, series: idx };
    }
    // Overlay other tickers (multi-stock compare), max 4.
    if (req.query.peers && provider.chartSeries) {
      const list = String(req.query.peers).toUpperCase().split(",").map((s) => s.trim())
        .filter((t) => TICKERS.includes(t) && t !== ticker).slice(0, 4);
      out.peers = [];
      for (const pt of list) {
        out.peers.push({ symbol: pt, series: await provider.chartSeries(pt, tf, store.stocks[pt]?.price ?? 0) });
      }
    }
    res.json(out);
  });

  // Historical track record — how the model's past signals have played out.
  app.get("/api/track-record", (req, res) => {
    res.json(db.getTrackRecord());
  });

  // ── Portfolio (Phase 3) ─────────────────────────────────────────
  // Holdings enriched with live price + signal, P&L, and a roll-up.
  app.get("/api/portfolio", (req, res) => {
    res.json(buildPortfolio(db.listHoldings(), store.stocks));
  });

  // Add or update a position. Validates against the tracked universe.
  app.post("/api/portfolio", (req, res) => {
    const ticker = String(req.body?.ticker ?? "").toUpperCase();
    const shares = Number(req.body?.shares);
    const costBasis = Number(req.body?.costBasis);
    if (!TICKERS.includes(ticker)) return res.status(400).json({ error: `Unknown ticker ${ticker}` });
    if (!(shares > 0)) return res.status(400).json({ error: "shares must be a positive number" });
    if (!(costBasis > 0)) return res.status(400).json({ error: "costBasis must be a positive number" });
    db.upsertHolding({ ticker, shares, costBasis });
    res.json(buildPortfolio(db.listHoldings(), store.stocks));
  });

  // Remove a position.
  app.delete("/api/portfolio/:ticker", (req, res) => {
    db.removeHolding(req.params.ticker.toUpperCase());
    res.json(buildPortfolio(db.listHoldings(), store.stocks));
  });

  // ── Alerts (Phase 4) ────────────────────────────────────────────
  // Recent signal-transition alerts + unread count.
  app.get("/api/alerts", (req, res) => {
    res.json({ alerts: db.listAlerts(50), unread: db.unreadAlertCount(), channel: channel.mode });
  });

  // Mark all alerts as read.
  app.post("/api/alerts/read", (req, res) => {
    db.markAlertsRead();
    res.json({ alerts: db.listAlerts(50), unread: 0 });
  });

  // Manual refresh. Returns immediately; the polling client picks up new data.
  app.post("/api/refresh", (req, res) => {
    if (!store.refreshing) {
      refreshAll({ spacingMs }).then(() => {
        store.nextUpdate = new Date(Date.now() + REFRESH_MIN * 60_000).toISOString();
      });
    }
    res.json({ ok: true, refreshing: true });
  });

  // Per-ticker chat.
  app.post("/api/chat/:ticker", async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const { message, history } = req.body ?? {};
    if (!message) return res.status(400).json({ error: "message required" });
    try {
      const out = await ai.chat({ ticker, stock: store.stocks[ticker], message, history });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Portfolio advisor — "what should I buy / hold / sell?" over the board.
  app.post("/api/advisor", async (req, res) => {
    const { message, history } = req.body ?? {};
    if (!message) return res.status(400).json({ error: "message required" });
    const stocks = Object.values(store.stocks);
    if (!stocks.length) return res.json({ reply: "No signals loaded yet — try refreshing first.", model: ai.mode });
    try {
      const out = await ai.advise({ stocks, message, history });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Serve the built frontend in production (dist/), if present.
  const distDir = path.join(__dirname, "dist");
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));
  }

  return { app, store, refreshAll, provider, ai, db, REFRESH_MIN, spacingMs };
}

// ─── Scheduler ──────────────────────────────────────────────────
// Refreshes on an interval. Market-hours aware so live mode doesn't burn
// API calls overnight; mock mode always refreshes so the demo stays lively.
function isUsMarketOpen(date = new Date()) {
  // Convert to US/Eastern via locale trick.
  const et = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins <= 16 * 60; // 9:30–16:00 ET
}

// ─── Start (skipped when imported by tests) ─────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const PORT = Number(process.env.PORT ?? 3000);
  const { app, store, refreshAll, provider, ai, REFRESH_MIN, spacingMs } = buildApp();

  app.listen(PORT, async () => {
    console.log(`Trendline API on http://localhost:${PORT}  [data:${provider.mode} ai:${ai.mode}]`);
    // Initial load so the UI isn't empty on boot.
    await refreshAll({ spacingMs });
    store.nextUpdate = new Date(Date.now() + REFRESH_MIN * 60_000).toISOString();

    setInterval(async () => {
      if (provider.mode === "live" && !isUsMarketOpen()) return;
      await refreshAll({ spacingMs });
      store.nextUpdate = new Date(Date.now() + REFRESH_MIN * 60_000).toISOString();
    }, REFRESH_MIN * 60_000);
  });
}
