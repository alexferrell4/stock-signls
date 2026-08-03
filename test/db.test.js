import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/server/db.js";
import { makeMockProvider } from "../src/server/providers/mock.js";
import { makeAI } from "../src/server/ai.js";
import { createStore } from "../src/server/store.js";

// All in-memory — no file on disk, no network, no API keys.
const mem = (extra = {}) => createDb({ DB_PATH: ":memory:", EVAL_HORIZON_MS: "0", HOLD_BAND: "1", ...extra });
const snap = (db, ticker, price, signal, tsMs) =>
  db.recordSnapshot({ ticker, ts: new Date(tsMs).toISOString(), tsMs, price, score: 0.5, signal, changePercent: 0 });

test("node:sqlite persistence is available and enabled", () => {
  const db = mem();
  assert.equal(db.enabled, true);
  db.close();
});

test("grades BUY/SELL/HOLD directionally and aggregates track record", () => {
  const db = mem();
  const t0 = Date.now() - 10_000;
  snap(db, "AAA", 100, "BUY", t0);   // will rise → correct
  snap(db, "BBB", 100, "SELL", t0);  // will rise → wrong
  snap(db, "CCC", 100, "HOLD", t0);  // will stay flat → correct

  const n = db.evaluatePending({ AAA: 110, BBB: 110, CCC: 100.5 }, Date.now());
  assert.equal(n, 3);

  const tr = db.getTrackRecord();
  assert.equal(tr.evaluated, 3);
  assert.equal(tr.bySignal.find((s) => s.signal === "BUY").hitRate, 100);
  assert.equal(tr.bySignal.find((s) => s.signal === "SELL").hitRate, 0);
  assert.equal(tr.bySignal.find((s) => s.signal === "HOLD").hits, 1);
  assert.equal(tr.overall.n, 3);
  assert.equal(tr.best.forward_return, 10);   // AAA +10%
  assert.equal(tr.worst.ticker, "BBB");
  db.close();
});

test("a snapshot is graded exactly once", () => {
  const db = mem();
  snap(db, "AAA", 100, "BUY", Date.now() - 5_000);
  assert.equal(db.evaluatePending({ AAA: 110 }, Date.now()), 1);
  assert.equal(db.evaluatePending({ AAA: 120 }, Date.now()), 0);
  db.close();
});

test("evaluation horizon defers grading until it elapses", () => {
  const db = mem({ EVAL_HORIZON_MS: "60000" });
  const now = Date.now();
  snap(db, "AAA", 100, "BUY", now);
  assert.equal(db.evaluatePending({ AAA: 110 }, now), 0);          // too soon
  assert.equal(db.evaluatePending({ AAA: 110 }, now + 61_000), 1); // after horizon
  db.close();
});

test("store accumulates a track record across refresh cycles", async () => {
  const db = mem();
  const provider = makeMockProvider();
  const { refreshAll } = createStore({ provider, ai: makeAI({}), db });
  await refreshAll(); // cycle 1: record
  await refreshAll(); // cycle 2: grade cycle 1, record cycle 2

  const tr = db.getTrackRecord();
  assert.equal(tr.total, provider.tickers.length * 2);
  assert.equal(tr.evaluated, provider.tickers.length); // only cycle 1 graded so far
  assert.equal(tr.overall.n, provider.tickers.length);
  db.close();
});

test("track record is empty (not crashing) before any evaluation", () => {
  const db = mem();
  const tr = db.getTrackRecord();
  assert.equal(tr.evaluated, 0);
  assert.equal(tr.overall, null);
  assert.deepEqual(tr.bySignal, []);
  db.close();
});
