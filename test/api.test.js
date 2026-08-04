import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server.js";

// Boot the real Express app in full mock mode on an ephemeral port and
// exercise it over HTTP. No keys, no external network, no spend.
const env = { DATA_MODE: "mock", AI_MODE: "mock", REFRESH_MINUTES: "5", DB_PATH: ":memory:", EVAL_HORIZON_MS: "0" };

let server, base, ctx;

before(async () => {
  ctx = buildApp(env);
  await ctx.refreshAll();
  await new Promise((resolve) => {
    server = ctx.app.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => server?.close());

const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body) =>
  (await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const del = async (p) => (await fetch(base + p, { method: "DELETE" })).json();

test("GET /api/health reports mock modes and persistence", async () => {
  const h = await get("/api/health");
  assert.equal(h.ok, true);
  assert.equal(h.dataMode, "mock");
  assert.equal(h.aiMode, "mock");
  assert.equal(h.persistence, "sqlite");
});

test("GET /api/track-record returns a valid (possibly empty) shape", async () => {
  const tr = await get("/api/track-record");
  assert.equal(tr.enabled, true);
  assert.ok(typeof tr.total === "number");
  assert.ok(Array.isArray(tr.bySignal));
});

test("GET /api/stocks returns sorted signals", async () => {
  const d = await get("/api/stocks");
  assert.ok(d.stocks.length > 0);
  for (let i = 1; i < d.stocks.length; i++) {
    assert.ok(d.stocks[i - 1].score >= d.stocks[i].score, "sorted by score desc");
  }
});

test("GET /api/stocks/:ticker returns stock, news, history, timeframes", async () => {
  const d = await get("/api/stocks/AAPL");
  assert.equal(d.stock.ticker, "AAPL");
  assert.ok(Array.isArray(d.news));
  assert.ok(Array.isArray(d.history) && d.history.length >= 1);
  assert.ok(d.stock.timeframes.daily && d.stock.timeframes.weekly && d.stock.timeframes.monthly);
  assert.ok(Array.isArray(d.priceHistory) && d.priceHistory.length > 1, "has a price series");
  assert.ok(typeof d.priceHistory[0].close === "number" && typeof d.priceHistory[0].t === "number");
});

test("GET /api/stocks/:ticker/chart returns a timeframe-shaped series", async () => {
  const day = await get("/api/stocks/AAPL/chart?tf=daily");
  const month = await get("/api/stocks/AAPL/chart?tf=monthly");
  assert.equal(day.timeframe, "daily");
  assert.ok(Array.isArray(day.series) && day.series.length > 1);
  assert.ok(typeof day.series[0].close === "number");
  // intraday series has more points than the ~monthly series
  assert.ok(day.series.length > month.series.length, "daily denser than monthly");
  // OHLC present for candlesticks
  const p = day.series[0];
  assert.ok(["open", "high", "low", "close"].every((k) => typeof p[k] === "number"), "has OHLC");
});

test("GET /api/stocks/:ticker/chart?compare=1 includes the index series", async () => {
  const d = await get("/api/stocks/AAPL/chart?tf=monthly&compare=1");
  assert.ok(d.index && d.index.name, "index present");
  assert.ok(Array.isArray(d.index.series) && d.index.series.length > 1);
});

test("GET /api/stocks/:ticker 404s for unknown symbol", async () => {
  const res = await fetch(base + "/api/stocks/ZZZZ");
  assert.equal(res.status, 404);
});

test("GET /api/search matches symbol and company name", async () => {
  const bySymbol = await get("/api/search?q=nvda");
  assert.ok(bySymbol.results.some((r) => r.ticker === "NVDA"));
  const byName = await get("/api/search?q=apple");
  assert.ok(byName.results.some((r) => r.ticker === "AAPL"));
});

test("POST /api/chat/:ticker replies grounded in the signal", async () => {
  const d = await post("/api/chat/AAPL", { message: "why this signal?" });
  assert.ok(typeof d.reply === "string" && d.reply.length > 0);
  assert.match(d.reply, /AAPL/);
});

test("POST /api/advisor answers buy/hold/sell across the board", async () => {
  const d = await post("/api/advisor", { message: "what should I buy hold or sell?" });
  assert.match(d.reply, /BUY|HOLD|SELL/);
  assert.match(d.reply, /informational/i);
});

test("POST /api/advisor validates input", async () => {
  const res = await fetch(base + "/api/advisor", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 400);
});

test("portfolio: add, enrich, and remove a position", async () => {
  const added = await post("/api/portfolio", { ticker: "AAPL", shares: 10, costBasis: 100 });
  const pos = added.positions.find((p) => p.ticker === "AAPL");
  assert.ok(pos, "position present");
  assert.equal(pos.shares, 10);
  assert.ok(typeof pos.marketValue === "number", "enriched with live price");
  assert.ok(["BUY", "HOLD", "SELL"].includes(pos.signal));
  assert.ok(typeof added.summary.totalValue === "number");

  const after = await del("/api/portfolio/AAPL");
  assert.ok(!after.positions.some((p) => p.ticker === "AAPL"));
});

test("GET /api/alerts returns a valid shape (in-app channel)", async () => {
  const a = await get("/api/alerts");
  assert.ok(Array.isArray(a.alerts));
  assert.equal(typeof a.unread, "number");
  assert.equal(a.channel, "inapp");
});

test("POST /api/alerts/read clears the unread count", async () => {
  const r = await post("/api/alerts/read", {});
  assert.equal(r.unread, 0);
});

test("POST /api/portfolio rejects unknown ticker and bad shares", async () => {
  const bad1 = await fetch(base + "/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: "ZZZZ", shares: 1, costBasis: 1 }) });
  assert.equal(bad1.status, 400);
  const bad2 = await fetch(base + "/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: "AAPL", shares: -5, costBasis: 100 }) });
  assert.equal(bad2.status, 400);
});
