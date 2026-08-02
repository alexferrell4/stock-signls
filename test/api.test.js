import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server.js";

// Boot the real Express app in full mock mode on an ephemeral port and
// exercise it over HTTP. No keys, no external network, no spend.
const env = { DATA_MODE: "mock", AI_MODE: "mock", REFRESH_MINUTES: "5" };

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

test("GET /api/health reports mock modes", async () => {
  const h = await get("/api/health");
  assert.equal(h.ok, true);
  assert.equal(h.dataMode, "mock");
  assert.equal(h.aiMode, "mock");
});

test("GET /api/stocks returns sorted signals", async () => {
  const d = await get("/api/stocks");
  assert.ok(d.stocks.length > 0);
  for (let i = 1; i < d.stocks.length; i++) {
    assert.ok(d.stocks[i - 1].score >= d.stocks[i].score, "sorted by score desc");
  }
});

test("GET /api/stocks/:ticker returns stock, news, history", async () => {
  const d = await get("/api/stocks/AAPL");
  assert.equal(d.stock.ticker, "AAPL");
  assert.ok(Array.isArray(d.news));
  assert.ok(Array.isArray(d.history) && d.history.length >= 1);
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
