import { useState, useEffect, useCallback } from "react";
import { fetchTrackRecord } from "../lib/api";

const sigColor = (s) => (s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)");

// Historical track record — how the model's past signals actually played out.
// Data accumulates across refreshes (persisted in SQLite), so this starts in a
// "gathering data" state and fills in as signals get graded.
export default function TrackRecord({ refreshing }) {
  const [tr, setTr] = useState(null);

  const load = useCallback(async () => {
    try { setTr(await fetchTrackRecord()); } catch { /* server may be down */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);
  // Re-pull shortly after a manual refresh grades new signals.
  useEffect(() => { if (!refreshing) { const t = setTimeout(load, 1500); return () => clearTimeout(t); } }, [refreshing, load]);

  if (!tr || tr.enabled === false) return null;

  const graded = tr.evaluated > 0 && tr.overall;

  return (
    <div style={{ padding: "8px 28px 0" }}>
      <div style={{
        background: "linear-gradient(180deg, var(--surf), rgba(15,22,40,.6))",
        border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 18px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: graded ? 14 : 0 }}>
          <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)", fontWeight: 600 }}>
            ◷ Track Record
          </span>
          <span style={{ fontSize: ".64rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
            {tr.evaluated} graded · {tr.total} recorded
          </span>
        </div>

        {!graded ? (
          <p style={{ fontSize: ".76rem", color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }}>
            Gathering data — signals are being recorded and will be graded against later prices as the market moves.
            Accuracy appears here once the first signals resolve.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 22, alignItems: "center" }}>
            {/* Overall hit rate */}
            <Metric
              label="Hit Rate"
              value={`${tr.overall.hitRate}%`}
              color={tr.overall.hitRate >= 50 ? "var(--buy)" : "var(--sell)"}
              sub={`${tr.overall.hits}/${tr.overall.n} calls`}
            />
            {/* Avg forward return */}
            <Metric
              label="Avg Return"
              value={`${tr.overall.avgReturn >= 0 ? "+" : ""}${tr.overall.avgReturn}%`}
              color={tr.overall.avgReturn >= 0 ? "var(--buy)" : "var(--sell)"}
              sub="per signal"
            />
            {/* Per-signal accuracy bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
              {["BUY", "HOLD", "SELL"].map((sig) => {
                const row = tr.bySignal.find((s) => s.signal === sig);
                const rate = row?.hitRate ?? 0;
                return (
                  <div key={sig} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 34, fontSize: ".62rem", fontWeight: 700, color: sigColor(sig) }}>{sig}</span>
                    <div style={{ flex: 1, height: 5, background: "var(--surf2)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${rate}%`, background: sigColor(sig), borderRadius: 3, transition: "width .5s" }} />
                    </div>
                    <span style={{ width: 54, textAlign: "right", fontFamily: "var(--mono)", fontSize: ".64rem", color: "var(--dim)" }}>
                      {row ? `${rate}% (${row.n})` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Best / worst call */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Call label="Best call" row={tr.best} good />
              <Call label="Worst call" row={tr.worst} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color, sub }) {
  return (
    <div>
      <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: ".6rem", color: "var(--muted)" }}>{sub}</div>
    </div>
  );
}

function Call({ label, row, good }) {
  if (!row) return null;
  const ret = row.forward_return ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: ".58rem", color: "var(--muted)", width: 60 }}>{label}</span>
      <span style={{ fontSize: ".7rem", fontWeight: 700 }}>{row.ticker}</span>
      <span style={{ fontSize: ".58rem", fontWeight: 700, color: sigColor(row.signal) }}>{row.signal}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: ".68rem", color: good ? "var(--buy)" : "var(--sell)" }}>
        {ret >= 0 ? "+" : ""}{ret}%
      </span>
    </div>
  );
}
