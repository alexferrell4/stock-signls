// ─── Persistence (SQLite) ───────────────────────────────────────
// A local SQLite file (via Node's built-in node:sqlite — no dependency,
// no native build, no external service). This is the durable store behind
// the historical track record: every refresh snapshots each signal, and
// later refreshes evaluate whether those past signals were "right".
//
// DB_PATH env selects the file (default ./trendline.db). Tests pass
// ":memory:" for an ephemeral DB. No API keys, no network — safe in tests.

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null; // older Node without node:sqlite → graceful no-op
}

// When a signal is evaluated, was it directionally right?
//   BUY  → correct if price rose
//   SELL → correct if price fell
//   HOLD → correct if it stayed within a small band
function judge(signal, forwardReturn, holdBand) {
  if (signal === "BUY") return forwardReturn > 0 ? 1 : 0;
  if (signal === "SELL") return forwardReturn < 0 ? 1 : 0;
  return Math.abs(forwardReturn) <= holdBand ? 1 : 0; // HOLD
}

const round2 = (v) => Math.round(v * 100) / 100;

// A no-op repository so the app runs even if SQLite is unavailable.
function nullDb() {
  return {
    enabled: false,
    recordSnapshot() {},
    evaluatePending() { return 0; },
    getTrackRecord() { return { enabled: false, total: 0, evaluated: 0, overall: null, bySignal: [], best: null, worst: null }; },
    getTickerHistory() { return []; },
    upsertHolding() {},
    removeHolding() {},
    listHoldings() { return []; },
    close() {},
  };
}

export function createDb(env = process.env) {
  if (!DatabaseSync) return nullDb();

  const path = env.DB_PATH ?? "./trendline.db";
  const holdBand = Number(env.HOLD_BAND ?? 1.0);      // % move that still counts as a good HOLD
  const horizonMs = Number(env.EVAL_HORIZON_MS ?? 0); // how long before a signal is graded

  // The ENTIRE init is guarded: if the DB file can't be opened or set up
  // (e.g. locked by OneDrive sync, corrupt, or read-only disk), we degrade
  // to in-memory instead of crashing the whole API server. A dead track
  // record is acceptable; a dead server ("cannot reach server") is not.
  try {
  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker         TEXT NOT NULL,
      ts             TEXT NOT NULL,
      ts_ms          INTEGER NOT NULL,
      price          REAL NOT NULL,
      score          REAL NOT NULL,
      signal         TEXT NOT NULL,
      change_percent REAL,
      eval_price     REAL,
      eval_ts        TEXT,
      forward_return REAL,
      correct        INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_snap_ticker ON snapshots(ticker, ts_ms);
    CREATE INDEX IF NOT EXISTS idx_snap_pending ON snapshots(ticker, correct);

    CREATE TABLE IF NOT EXISTS holdings (
      ticker     TEXT PRIMARY KEY,
      shares     REAL NOT NULL,
      cost_basis REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const insert = db.prepare(
    `INSERT INTO snapshots (ticker, ts, ts_ms, price, score, signal, change_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const pendingForTicker = db.prepare(
    `SELECT id, price, signal FROM snapshots
     WHERE ticker = ? AND correct IS NULL AND ts_ms <= ?`
  );
  const evalUpdate = db.prepare(
    `UPDATE snapshots SET eval_price = ?, eval_ts = ?, forward_return = ?, correct = ? WHERE id = ?`
  );

  function recordSnapshot({ ticker, ts, tsMs, price, score, signal, changePercent }) {
    insert.run(ticker, ts, tsMs, price, score, signal, changePercent ?? null);
  }

  // Grade every prior ungraded snapshot that has passed the horizon, using
  // the latest price as the "future" price.
  function evaluatePending(currentPrices, nowMs = Date.now()) {
    const cutoff = nowMs - horizonMs;
    const evalTs = new Date(nowMs).toISOString();
    let n = 0;
    for (const [ticker, price] of Object.entries(currentPrices)) {
      const rows = pendingForTicker.all(ticker, cutoff);
      for (const row of rows) {
        const fwd = row.price ? round2(((price - row.price) / row.price) * 100) : 0;
        evalUpdate.run(price, evalTs, fwd, judge(row.signal, fwd, holdBand), row.id);
        n++;
      }
    }
    return n;
  }

  function getTrackRecord() {
    const total = db.prepare(`SELECT COUNT(*) c FROM snapshots`).get().c;
    const evaluated = db.prepare(`SELECT COUNT(*) c FROM snapshots WHERE correct IS NOT NULL`).get().c;

    const bySignal = db.prepare(
      `SELECT signal,
              COUNT(*)          AS n,
              SUM(correct)      AS hits,
              AVG(forward_return) AS avg_return
       FROM snapshots WHERE correct IS NOT NULL
       GROUP BY signal`
    ).all().map((r) => ({
      signal: r.signal,
      n: r.n,
      hits: r.hits ?? 0,
      hitRate: r.n ? Math.round((r.hits / r.n) * 100) : 0,
      avgReturn: r.avg_return != null ? round2(r.avg_return) : 0,
    }));

    const overallRow = db.prepare(
      `SELECT COUNT(*) n, SUM(correct) hits, AVG(forward_return) avg_return
       FROM snapshots WHERE correct IS NOT NULL`
    ).get();
    const overall = overallRow.n
      ? { n: overallRow.n, hits: overallRow.hits ?? 0, hitRate: Math.round(((overallRow.hits ?? 0) / overallRow.n) * 100), avgReturn: round2(overallRow.avg_return ?? 0) }
      : null;

    // Best/worst are about DIRECTIONAL calls (BUY/SELL) — HOLD isn't a bet,
    // so exclude it. Rank by edge: for a SELL a price drop is favorable.
    const EDGE = `(CASE WHEN signal = 'SELL' THEN -forward_return ELSE forward_return END)`;
    const DIRECTIONAL = `correct IS NOT NULL AND signal IN ('BUY','SELL')`;
    const best = db.prepare(
      `SELECT ticker, signal, forward_return, ts FROM snapshots WHERE ${DIRECTIONAL} ORDER BY ${EDGE} DESC LIMIT 1`
    ).get() ?? null;
    const worst = db.prepare(
      `SELECT ticker, signal, forward_return, ts FROM snapshots WHERE ${DIRECTIONAL} ORDER BY ${EDGE} ASC LIMIT 1`
    ).get() ?? null;

    return { enabled: true, total, evaluated, overall, bySignal, best, worst };
  }

  function getTickerHistory(ticker, limit = 100) {
    return db.prepare(
      `SELECT ts, score, price, signal, forward_return, correct
       FROM snapshots WHERE ticker = ? ORDER BY ts_ms ASC LIMIT ?`
    ).all(ticker, limit);
  }

  // ── Portfolio holdings (Phase 3) ──────────────────────────────
  const holdingUpsert = db.prepare(
    `INSERT INTO holdings (ticker, shares, cost_basis, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(ticker) DO UPDATE SET shares = excluded.shares, cost_basis = excluded.cost_basis, updated_at = excluded.updated_at`
  );
  const holdingDelete = db.prepare(`DELETE FROM holdings WHERE ticker = ?`);
  const holdingList = db.prepare(`SELECT ticker, shares, cost_basis, updated_at FROM holdings ORDER BY ticker`);

  function upsertHolding({ ticker, shares, costBasis }) {
    holdingUpsert.run(ticker, shares, costBasis, new Date().toISOString());
  }
  function removeHolding(ticker) {
    holdingDelete.run(ticker);
  }
  function listHoldings() {
    return holdingList.all().map((h) => ({ ticker: h.ticker, shares: h.shares, costBasis: h.cost_basis, updatedAt: h.updated_at }));
  }

  return {
    enabled: true,
    recordSnapshot, evaluatePending, getTrackRecord, getTickerHistory,
    upsertHolding, removeHolding, listHoldings,
    close: () => db.close(),
  };
  } catch (e) {
    console.warn(`[trendline] persistence disabled (${e.message}); running in-memory.`);
    return nullDb();
  }
}
