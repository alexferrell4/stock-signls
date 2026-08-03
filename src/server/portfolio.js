// ─── Portfolio roll-up ──────────────────────────────────────────
// Pure function: given saved holdings and the current signal board, compute
// per-position P&L + each holding's live signal, plus a portfolio roll-up
// (total value/P&L, signal exposure by value, and SELL alerts). No I/O →
// unit-testable without a DB or network.

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

export function buildPortfolio(holdings, stocksByTicker) {
  const positions = holdings.map((h) => {
    const s = stocksByTicker[h.ticker] ?? null;
    const price = s?.price ?? null;
    const cost = h.shares * h.costBasis;
    const marketValue = price != null ? h.shares * price : null;
    const pl = marketValue != null ? marketValue - cost : null;
    const plPct = pl != null && cost > 0 ? (pl / cost) * 100 : null;
    return {
      ticker: h.ticker,
      shares: h.shares,
      costBasis: h.costBasis,
      price,
      signal: s?.signal ?? null,
      score: s?.score ?? null,
      changePercent: s?.changePercent ?? null,
      cost: round2(cost),
      marketValue: round2(marketValue),
      pl: round2(pl),
      plPct: round2(plPct),
    };
  });

  const priced = positions.filter((p) => p.marketValue != null);
  const totalValue = priced.reduce((a, p) => a + p.marketValue, 0);
  const totalCost = priced.reduce((a, p) => a + p.cost, 0);
  const totalPl = totalValue - totalCost;

  // Signal exposure = share of portfolio market value sitting in BUY / HOLD /
  // SELL names. Tells you how the book is positioned versus the model.
  const exposure = { BUY: 0, HOLD: 0, SELL: 0 };
  for (const p of priced) {
    if (p.signal && exposure[p.signal] != null) exposure[p.signal] += p.marketValue;
  }
  const exposurePct = {};
  for (const k of Object.keys(exposure)) {
    exposurePct[k] = totalValue > 0 ? Math.round((exposure[k] / totalValue) * 100) : 0;
  }

  // Positions the model currently rates SELL — the "you own X and it flipped
  // to SELL" surfacing this phase is about.
  const alerts = positions
    .filter((p) => p.signal === "SELL")
    .map((p) => ({ ticker: p.ticker, signal: p.signal, plPct: p.plPct }));

  return {
    positions: positions.sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1)),
    summary: {
      count: positions.length,
      totalValue: round2(totalValue),
      totalCost: round2(totalCost),
      totalPl: round2(totalPl),
      totalPlPct: round2(totalCost > 0 ? (totalPl / totalCost) * 100 : 0),
      exposure: { BUY: round2(exposure.BUY), HOLD: round2(exposure.HOLD), SELL: round2(exposure.SELL) },
      exposurePct,
      alerts,
    },
  };
}
