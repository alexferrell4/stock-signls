import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAlerts, makeAlertChannel } from "../src/server/alerts.js";
import { createDb } from "../src/server/db.js";

test("detectAlerts fires only on signal transitions", () => {
  const prev = { AAPL: "BUY", TSLA: "HOLD", NVDA: "BUY" };
  const stocks = {
    AAPL: { ticker: "AAPL", signal: "SELL" }, // changed
    TSLA: { ticker: "TSLA", signal: "HOLD" }, // unchanged
    NVDA: { ticker: "NVDA", signal: "BUY" },  // unchanged
    AMD: { ticker: "AMD", signal: "BUY" },    // no prior → skip
  };
  const alerts = detectAlerts(prev, stocks, new Set(), 1000);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].ticker, "AAPL");
  assert.equal(alerts[0].fromSignal, "BUY");
  assert.equal(alerts[0].toSignal, "SELL");
});

test("detectAlerts flags held positions and prioritizes them", () => {
  const prev = { AAPL: "BUY", MSFT: "HOLD" };
  const stocks = {
    AAPL: { ticker: "AAPL", signal: "SELL" }, // held downgrade
    MSFT: { ticker: "MSFT", signal: "BUY" },  // not held upgrade
  };
  const alerts = detectAlerts(prev, stocks, new Set(["AAPL"]), 1000);
  assert.equal(alerts[0].ticker, "AAPL"); // held + SELL ranks first
  assert.equal(alerts[0].held, true);
  assert.equal(alerts[0].severity, "high");
  assert.match(alerts[0].message, /You own AAPL/);

  const msft = alerts.find((a) => a.ticker === "MSFT");
  assert.equal(msft.severity, "good");
  assert.equal(msft.held, false);
});

test("alert channel defaults to in-app and delivers without external calls", async () => {
  const ch = makeAlertChannel({});
  assert.equal(ch.mode, "inapp");
  await ch.deliver({ message: "x" }); // no throw, no external side effect
});

test("alerts persist: record, list newest-first, unread count, mark read", () => {
  const db = createDb({ DB_PATH: ":memory:" });
  db.recordAlert({ ts: "t1", tsMs: 1, ticker: "AAPL", fromSignal: "BUY", toSignal: "SELL", held: true, severity: "high", message: "m1" });
  db.recordAlert({ ts: "t2", tsMs: 2, ticker: "TSLA", fromSignal: "HOLD", toSignal: "BUY", held: false, severity: "good", message: "m2" });

  assert.equal(db.unreadAlertCount(), 2);
  const list = db.listAlerts();
  assert.equal(list.length, 2);
  assert.equal(list[0].ticker, "TSLA"); // ts_ms DESC → newest first
  assert.equal(list[0].held, false);
  assert.equal(list[1].held, true);

  db.markAlertsRead();
  assert.equal(db.unreadAlertCount(), 0);
  assert.equal(db.listAlerts()[0].read, true);
  db.close();
});
