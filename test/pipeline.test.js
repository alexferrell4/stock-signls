import { test } from "node:test";
import assert from "node:assert/strict";
import { makeMockProvider } from "../src/server/providers/mock.js";
import { makeAI, DISCLAIMER } from "../src/server/ai.js";
import { createStore } from "../src/server/store.js";

// Force mock everything — no keys, no network, no spend.
const env = { DATA_MODE: "mock", AI_MODE: "mock" };

test("mock provider returns well-formed quotes and news", async () => {
  const p = makeMockProvider();
  const q = await p.quote("AAPL");
  assert.ok(typeof q.price === "number" && q.price > 0);
  assert.ok(typeof q.changePercent === "number");
  assert.ok(q.avgVolume > 0 && q.currentVolume > 0);
  const news = await p.news("AAPL");
  assert.ok(Array.isArray(news) && news.length > 0);
  assert.ok(news.every((n) => typeof n.headline === "string" && typeof n.sentiment === "number"));
});

test("mock provider is deterministic within a cycle", async () => {
  const a = await makeMockProvider().quote("TSLA");
  const b = await makeMockProvider().quote("TSLA");
  assert.deepEqual(a, b);
});

test("refreshAll populates the store for the whole universe", async () => {
  const provider = makeMockProvider();
  const ai = makeAI(env);
  const { store, refreshAll } = createStore({ provider, ai });

  assert.equal(Object.keys(store.stocks).length, 0);
  await refreshAll();
  assert.equal(Object.keys(store.stocks).length, provider.tickers.length);
  assert.ok(store.lastUpdated);

  const sample = store.stocks[provider.tickers[0]];
  assert.ok(["BUY", "HOLD", "SELL"].includes(sample.signal));
  assert.ok(sample.aiAnalysis?.summary);
  assert.equal(sample.aiAnalysis.disclaimer, DISCLAIMER);
});

test("refreshAll appends intraday history each cycle", async () => {
  const provider = makeMockProvider();
  const { store, refreshAll } = createStore({ provider, ai: makeAI(env) });
  await refreshAll();
  await refreshAll();
  const t = provider.tickers[0];
  assert.equal(store.history[t].length, 2);
});

test("advisor summarizes the board and always includes the disclaimer", async () => {
  const provider = makeMockProvider();
  const ai = makeAI(env);
  const { store, refreshAll } = createStore({ provider, ai });
  await refreshAll();
  const out = await ai.advise({ stocks: Object.values(store.stocks), message: "what should I buy hold or sell?" });
  assert.ok(out.reply.includes(DISCLAIMER), "reply carries disclaimer");
  assert.match(out.reply, /BUY|HOLD|SELL/);
});
