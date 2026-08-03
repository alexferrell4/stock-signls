import { test } from "node:test";
import assert from "node:assert/strict";
import { makeMockProvider } from "../src/server/providers/mock.js";
import { makeAI } from "../src/server/ai.js";
import { createStore } from "../src/server/store.js";
import { TIMEFRAMES } from "../src/server/universe.js";

test("mock provider returns a change for every timeframe", async () => {
  const p = makeMockProvider();
  const ch = await p.changes("AAPL", 200, 1.5);
  assert.equal(ch.daily, 1.5); // daily passes through the quote's change
  assert.equal(typeof ch.weekly, "number");
  assert.equal(typeof ch.monthly, "number");
});

test("store builds a full signal per timeframe; top-level mirrors daily", async () => {
  const provider = makeMockProvider();
  const { store, refreshAll } = createStore({ provider, ai: makeAI({}) });
  await refreshAll();

  const s = Object.values(store.stocks)[0];
  assert.ok(s.timeframes, "stock has timeframes");
  for (const tf of TIMEFRAMES) {
    const t = s.timeframes[tf];
    assert.ok(t, `timeframe ${tf} present`);
    assert.ok(["BUY", "HOLD", "SELL"].includes(t.signal));
    assert.equal(typeof t.changePercent, "number");
    assert.ok(t.explanation && typeof t.explanation.total === "number");
  }
  // Canonical top-level == daily (what alerts / track record / portfolio use).
  assert.equal(s.signal, s.timeframes.daily.signal);
  assert.equal(s.changePercent, s.timeframes.daily.changePercent);
  assert.equal(s.score, s.timeframes.daily.score);
});

test("timeframes are independent — signals can differ across windows", async () => {
  const provider = makeMockProvider();
  const { store, refreshAll } = createStore({ provider, ai: makeAI({}) });
  await refreshAll();
  const someDiffer = Object.values(store.stocks).some((s) => {
    return new Set(TIMEFRAMES.map((tf) => s.timeframes[tf].signal)).size > 1;
  });
  assert.ok(someDiffer, "at least one stock has different signals across timeframes");
});
