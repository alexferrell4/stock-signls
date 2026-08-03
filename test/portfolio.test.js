import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPortfolio } from "../src/server/portfolio.js";
import { createDb } from "../src/server/db.js";

const stocks = {
  AAPL: { price: 200, signal: "BUY", score: 0.7, changePercent: 1.2 },
  TSLA: { price: 100, signal: "SELL", score: 0.3, changePercent: -2.0 },
  MSFT: { price: 400, signal: "HOLD", score: 0.5, changePercent: 0.1 },
};

test("buildPortfolio computes P&L per position", () => {
  const { positions } = buildPortfolio(
    [{ ticker: "AAPL", shares: 10, costBasis: 150 }, { ticker: "TSLA", shares: 5, costBasis: 120 }],
    stocks
  );
  const aapl = positions.find((p) => p.ticker === "AAPL");
  assert.equal(aapl.marketValue, 2000);
  assert.equal(aapl.cost, 1500);
  assert.equal(aapl.pl, 500);
  assert.equal(aapl.plPct, 33.33);
  assert.equal(aapl.signal, "BUY");

  const tsla = positions.find((p) => p.ticker === "TSLA");
  assert.equal(tsla.pl, -100);
  assert.equal(tsla.plPct, -16.67);
});

test("buildPortfolio rolls up totals, exposure, and SELL alerts", () => {
  const { summary } = buildPortfolio(
    [{ ticker: "AAPL", shares: 10, costBasis: 150 }, { ticker: "TSLA", shares: 5, costBasis: 120 }],
    stocks
  );
  assert.equal(summary.totalValue, 2500);
  assert.equal(summary.totalCost, 2100);
  assert.equal(summary.totalPl, 400);
  assert.equal(summary.exposure.BUY, 2000);
  assert.equal(summary.exposure.SELL, 500);
  assert.equal(summary.exposurePct.BUY, 80);
  assert.equal(summary.exposurePct.SELL, 20);
  assert.equal(summary.alerts.length, 1);
  assert.equal(summary.alerts[0].ticker, "TSLA");
});

test("buildPortfolio tolerates a holding with no live price", () => {
  const { positions, summary } = buildPortfolio([{ ticker: "NFLX", shares: 3, costBasis: 500 }], {});
  assert.equal(positions[0].marketValue, null);
  assert.equal(positions[0].pl, null);
  assert.equal(summary.totalValue, 0);
  assert.equal(summary.count, 1);
});

test("empty portfolio yields zeroed summary", () => {
  const { positions, summary } = buildPortfolio([], stocks);
  assert.deepEqual(positions, []);
  assert.equal(summary.totalValue, 0);
  assert.equal(summary.totalPlPct, 0);
  assert.deepEqual(summary.alerts, []);
});

test("holdings persist: upsert replaces, remove deletes", () => {
  const db = createDb({ DB_PATH: ":memory:" });
  db.upsertHolding({ ticker: "AAPL", shares: 10, costBasis: 150 });
  db.upsertHolding({ ticker: "TSLA", shares: 5, costBasis: 120 });
  assert.equal(db.listHoldings().length, 2);

  db.upsertHolding({ ticker: "AAPL", shares: 20, costBasis: 160 }); // update, not duplicate
  const list = db.listHoldings();
  assert.equal(list.length, 2);
  assert.equal(list.find((h) => h.ticker === "AAPL").shares, 20);
  assert.equal(list.find((h) => h.ticker === "AAPL").costBasis, 160);

  db.removeHolding("AAPL");
  assert.equal(db.listHoldings().length, 1);
  assert.equal(db.listHoldings()[0].ticker, "TSLA");
  db.close();
});
