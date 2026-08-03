import Sparkline from "./Sparkline";
import { COMPANY } from "./Navbar";

const f$ = (p) => (p != null ? `$${Number(p).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
const sigColor = (s) => (s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)");
const sigDim = (s) => (s === "BUY" ? "var(--buy-d)" : s === "SELL" ? "var(--sell-d)" : "var(--hold-d)");

const COLS = [
  { key: "ticker", label: "Symbol", w: "22%", align: "left" },
  { key: "price", label: "Price", w: "14%", align: "right" },
  { key: "changePercent", label: "Change", w: "12%", align: "right" },
  { key: "trend", label: "Trend", w: "16%", align: "center", sortable: false },
  { key: "score", label: "Score", w: "22%", align: "left" },
  { key: "signal", label: "Signal", w: "14%", align: "right" },
];

// Dense, sortable list view. Clicking a header sorts; clicking a row opens it.
export default function StockTable({ stocks, onSelect, sortKey, sortDir, onSort, has, onToggleStar }) {
  return (
    <div style={{ padding: "0 28px 48px", overflowX: "auto" }}>
      <div style={{ minWidth: 640, border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surf)" }}>
        {/* Header */}
        <div style={{ display: "flex", padding: "11px 18px", borderBottom: "1px solid var(--border2)", background: "var(--surf2)" }}>
          {COLS.map((c) => {
            const active = sortKey === c.key;
            return (
              <div key={c.key} onClick={() => c.sortable !== false && onSort(c.key)}
                style={{
                  width: c.w, textAlign: c.align,
                  fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700,
                  color: active ? "var(--text)" : "var(--muted)",
                  cursor: c.sortable === false ? "default" : "pointer", userSelect: "none",
                }}>
                {c.label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {stocks.map((s, i) => {
          const c = sigColor(s.signal);
          const chg = s.changePercent ?? 0;
          return (
            <div key={s.ticker} onClick={() => onSelect(s.ticker)} className="fade-up"
              style={{
                display: "flex", alignItems: "center", padding: "12px 18px",
                borderBottom: i < stocks.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer", transition: "background .15s", animationDelay: `${Math.min(i * 20, 300)}ms`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              {/* Symbol */}
              <div style={{ width: "22%", display: "flex", alignItems: "center", gap: 8 }}>
                {onToggleStar && (
                  <button onClick={(e) => { e.stopPropagation(); onToggleStar(s.ticker); }}
                    title={has?.(s.ticker) ? "Unwatch" : "Watch"}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: ".85rem", lineHeight: 1, color: has?.(s.ticker) ? "var(--hold)" : "var(--muted)", opacity: has?.(s.ticker) ? 1 : 0.5 }}>
                    {has?.(s.ticker) ? "★" : "☆"}</button>
                )}
                <span style={{ width: 3, height: 26, borderRadius: 2, background: c }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".92rem" }}>{s.ticker}</div>
                  <div style={{ fontSize: ".62rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
                    {COMPANY[s.ticker] ?? s.company ?? s.ticker}
                  </div>
                </div>
              </div>
              {/* Price */}
              <div style={{ width: "14%", textAlign: "right", fontFamily: "var(--mono)", fontSize: ".85rem" }}>{f$(s.price)}</div>
              {/* Change */}
              <div style={{ width: "12%", textAlign: "right", fontFamily: "var(--mono)", fontSize: ".8rem", color: chg > 0 ? "var(--buy)" : chg < 0 ? "var(--sell)" : "var(--muted)" }}>
                {chg > 0 ? "+" : ""}{chg.toFixed(2)}%
              </div>
              {/* Trend */}
              <div style={{ width: "16%", display: "flex", justifyContent: "center" }}>
                <Sparkline data={s.spark ?? []} color={c} width={90} height={26} />
              </div>
              {/* Score */}
              <div style={{ width: "22%", display: "flex", alignItems: "center", gap: 9, paddingRight: 14 }}>
                <div style={{ flex: 1, height: 5, background: "var(--surf2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round((s.score ?? 0) * 100)}%`, background: c, borderRadius: 3, transition: "width .5s" }} />
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: ".8rem", fontWeight: 600, color: c, minWidth: 22, textAlign: "right" }}>
                  {Math.round((s.score ?? 0) * 100)}
                </span>
              </div>
              {/* Signal */}
              <div style={{ width: "14%", textAlign: "right" }}>
                <span style={{ padding: "3px 9px", borderRadius: 5, fontSize: ".64rem", fontWeight: 700, letterSpacing: ".05em", background: sigDim(s.signal), color: c }}>
                  {s.signal}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
