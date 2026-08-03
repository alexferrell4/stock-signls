import { COMPANY } from "./Navbar";

const sigColor = (s) => (s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)");

// Diverging red→green fill by change %, intensity scaled to ±5%.
function tileBg(chg) {
  const mag = Math.min(Math.abs(chg) / 5, 1);
  const rgb = chg > 0 ? "0,212,160" : chg < 0 ? "255,77,106" : "74,96,128";
  return `rgba(${rgb},${(0.1 + mag * 0.5).toFixed(2)})`;
}

// Market heatmap: every tracked name as a tile, colored by move, bordered by
// signal. A one-glance read of the whole board that grid/list views can't give.
export default function Heatmap({ stocks, onSelect, has, onToggleStar }) {
  return (
    <div style={{ padding: "0 28px 48px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 8 }}>
        {stocks.map((s, i) => {
          const chg = s.changePercent ?? 0;
          const c = sigColor(s.signal);
          const starred = has?.(s.ticker);
          return (
            <div key={s.ticker} onClick={() => onSelect(s.ticker)} className="fade-up"
              style={{
                position: "relative", cursor: "pointer", borderRadius: 10,
                padding: "13px 12px 11px", background: tileBg(chg),
                border: `1px solid ${c}`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.02)",
                transition: "transform .12s", animationDelay: `${Math.min(i * 15, 250)}ms`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
              {/* Star */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStar?.(s.ticker); }}
                title={starred ? "Unwatch" : "Watch"}
                style={{
                  position: "absolute", top: 6, right: 6, background: "transparent", border: "none",
                  cursor: "pointer", fontSize: ".8rem", lineHeight: 1,
                  color: starred ? "var(--hold)" : "var(--muted)", opacity: starred ? 1 : 0.5,
                }}>{starred ? "★" : "☆"}</button>

              <div style={{ fontWeight: 700, fontSize: "1rem" }}>{s.ticker}</div>
              <div style={{ fontSize: ".56rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 8 }}>
                {COMPANY[s.ticker] ?? s.company ?? ""}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: ".92rem", fontWeight: 600, color: chg > 0 ? "var(--buy)" : chg < 0 ? "var(--sell)" : "var(--dim)" }}>
                  {chg > 0 ? "+" : ""}{chg.toFixed(2)}%
                </span>
                <span style={{ fontSize: ".56rem", fontWeight: 700, letterSpacing: ".05em", color: c }}>{s.signal}</span>
              </div>
              {/* Score chip */}
              <div style={{ position: "absolute", bottom: 10, right: 10, fontFamily: "var(--mono)", fontSize: ".6rem", color: "var(--muted)" }}>
                {Math.round((s.score ?? 0) * 100)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
