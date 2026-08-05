import { COMPANY } from "./Navbar";

const sigColor = (s) => (s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)");

// Composite ranking: the model's signal score adjusted for technical
// alignment (9 EMA, RSI, FVG, volume). Higher = stronger setup for tomorrow.
function rank(s) {
  const t = s.technicals ?? {};
  let pts = Math.round((s.score ?? 0) * 100);
  const reasons = [];
  if (s.signal === "BUY") reasons.push("BUY signal");
  if (t.emaTrend === "above") { pts += 6; reasons.push("above 9 EMA"); }
  else if (t.emaTrend === "below") pts -= 4;
  if (t.rsi != null) {
    if (t.rsi >= 70) { pts -= 8; reasons.push("overbought"); }
    else if (t.rsi <= 35) { pts += 5; reasons.push("oversold bounce"); }
    else if (t.rsi >= 45 && t.rsi <= 65) { pts += 4; reasons.push("healthy RSI"); }
  }
  if (t.fvg?.type === "bullish") { pts += 5; reasons.push("bullish FVG"); }
  else if (t.fvg?.type === "bearish") pts -= 3;
  if (t.volumeVsAvg != null && t.volumeVsAvg >= 1.3) { pts += 4; reasons.push("volume surge"); }
  return { ...s, pts, reasons };
}

function Row({ p, i, onSelect, tone }) {
  const c = sigColor(p.signal);
  return (
    <div onClick={() => onSelect(p.ticker)} className="fade-up"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i > 0 ? "1px solid var(--border)" : "none", cursor: "pointer", animationDelay: `${Math.min(i * 25, 250)}ms` }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ width: 20, textAlign: "center", fontFamily: "var(--mono)", fontSize: ".8rem", color: "var(--muted)" }}>{i + 1}</span>
      <div style={{ width: 110 }}>
        <div style={{ fontWeight: 700 }}>{p.ticker}</div>
        <div style={{ fontSize: ".6rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{COMPANY[p.ticker] ?? ""}</div>
      </div>
      <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: ".62rem", fontWeight: 700, background: p.signal === "BUY" ? "var(--buy-d)" : p.signal === "SELL" ? "var(--sell-d)" : "var(--hold-d)", color: c }}>{p.signal}</span>
      <div style={{ flex: 1, display: "flex", gap: 5, flexWrap: "wrap" }}>
        {p.reasons.slice(0, 4).map((r) => (
          <span key={r} style={{ fontSize: ".6rem", color: "var(--dim)", background: "var(--surf2)", borderRadius: 4, padding: "2px 7px" }}>{r}</span>
        ))}
      </div>
      <div style={{ textAlign: "right", fontFamily: "var(--mono)" }}>
        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: tone === "avoid" ? "var(--sell)" : "var(--buy)" }}>{p.pts}</div>
        <div style={{ fontSize: ".58rem", color: "var(--muted)" }}>setup score</div>
      </div>
    </div>
  );
}

// "What to watch tomorrow" — ranked long candidates + names to steer clear of.
export default function TomorrowPicks({ stocks, onSelect }) {
  const ranked = (stocks ?? []).map(rank).sort((a, b) => b.pts - a.pts);
  const picks = ranked.slice(0, 6);
  const avoid = ranked.slice(-3).reverse();

  return (
    <div style={{ padding: "18px 28px 48px" }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Tomorrow's Watchlist</h2>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
          Ranked by the model's signal plus technical alignment — 9 EMA trend, RSI, Fair Value Gaps, and volume.
          Informational only, not personalized financial advice.
        </p>
      </div>

      {/* Top picks */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surf)", marginBottom: 16 }}>
        <div style={{ padding: "11px 16px", background: "var(--surf2)", fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, color: "var(--buy)" }}>▲ Strongest setups</div>
        {picks.map((p, i) => <Row key={p.ticker} p={p} i={i} onSelect={onSelect} tone="pick" />)}
      </div>

      {/* Avoid */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surf)" }}>
        <div style={{ padding: "11px 16px", background: "var(--surf2)", fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, color: "var(--sell)" }}>▼ Steer clear</div>
        {avoid.map((p, i) => <Row key={p.ticker} p={p} i={i} onSelect={onSelect} tone="avoid" />)}
      </div>

      <div style={{ marginTop: 12, fontSize: ".64rem", color: "var(--muted)", fontStyle: "italic" }}>
        Trendline surfaces algorithmic signals, not investment advice. Do your own research before trading.
      </div>
    </div>
  );
}
