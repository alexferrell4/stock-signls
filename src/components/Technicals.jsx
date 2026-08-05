const money = (v) => (v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const Label = ({ children }) => <span style={{ fontSize: ".57rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)" }}>{children}</span>;

const rsiColor = (z) => (z === "overbought" ? "var(--sell)" : z === "oversold" ? "var(--buy)" : "var(--dim)");

// Technicals & session levels: change-since-open, RSI, 9 EMA, volume, a Fair
// Value Gap read, and premarket high/low.
export default function Technicals({ tech, changeFromOpen, premarket, price }) {
  if (!tech && changeFromOpen == null && !premarket) return null;
  const t = tech ?? {};

  const tiles = [
    changeFromOpen != null && {
      label: "Since Open", value: `${changeFromOpen >= 0 ? "+" : ""}${changeFromOpen}%`,
      color: changeFromOpen >= 0 ? "var(--buy)" : "var(--sell)",
    },
    t.rsi != null && {
      label: "RSI (14)", value: t.rsi, color: rsiColor(t.rsiZone),
      sub: t.rsiZone,
    },
    t.ema9 != null && {
      label: "9 EMA", value: money(t.ema9),
      sub: t.emaTrend ? `price ${t.emaTrend}` : null,
      color: t.emaTrend === "above" ? "var(--buy)" : t.emaTrend === "below" ? "var(--sell)" : "var(--text)",
    },
    t.volumeVsAvg != null && {
      label: "Volume", value: `${t.volumeVsAvg}×`, sub: "vs avg",
      color: t.volumeVsAvg >= 1.5 ? "var(--buy)" : t.volumeVsAvg <= 0.6 ? "var(--sell)" : "var(--text)",
    },
  ].filter(Boolean);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>Technicals &amp; Levels</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10, marginBottom: 12 }}>
        {tiles.map((s) => (
          <div key={s.label} style={{ background: "var(--surf2)", borderRadius: 8, padding: "9px 11px" }}>
            <Label>{s.label}</Label>
            <div style={{ fontFamily: "var(--mono)", fontSize: ".95rem", fontWeight: 600, color: s.color ?? "var(--text)", marginTop: 3 }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: ".56rem", color: "var(--muted)", textTransform: "capitalize", marginTop: 1 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* FVG + premarket */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {t.fvg && (
          <div style={{ flex: 1, minWidth: 170, background: "var(--surf2)", borderRadius: 8, padding: "10px 12px", borderLeft: `2px solid ${t.fvg.type === "bullish" ? "var(--buy)" : "var(--sell)"}` }}>
            <Label>Fair Value Gap</Label>
            <div style={{ fontSize: ".8rem", marginTop: 4 }}>
              <span style={{ color: t.fvg.type === "bullish" ? "var(--buy)" : "var(--sell)", fontWeight: 700, textTransform: "capitalize" }}>{t.fvg.type}</span>
              <span style={{ fontFamily: "var(--mono)", color: "var(--dim)", marginLeft: 6 }}>{money(t.fvg.bottom)}–{money(t.fvg.top)}</span>
            </div>
            <div style={{ fontSize: ".58rem", color: "var(--muted)", marginTop: 2 }}>{t.fvg.barsAgo === 0 ? "forming now" : `${t.fvg.barsAgo} bars ago`}</div>
          </div>
        )}
        {premarket && (
          <div style={{ flex: 1, minWidth: 150, background: "var(--surf2)", borderRadius: 8, padding: "10px 12px" }}>
            <Label>Premarket H / L</Label>
            <div style={{ fontSize: ".8rem", marginTop: 4, fontFamily: "var(--mono)" }}>
              <span style={{ color: "var(--buy)" }}>{money(premarket.high)}</span>
              <span style={{ color: "var(--muted)" }}> / </span>
              <span style={{ color: "var(--sell)" }}>{money(premarket.low)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
