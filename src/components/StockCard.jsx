import SignalGauge from "./SignalGauge";
import { COMPANY } from "./Navbar";

const f$  = p => p != null ? `$${Number(p).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fv  = v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : (v || "—").toString();
const sigColor = s => s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)";
const sigDim   = s => s === "BUY" ? "var(--buy-d)" : s === "SELL" ? "var(--sell-d)" : "var(--hold-d)";

export default function StockCard({ stock, onClick }) {
  const { ticker, price, changePercent, signal, score, breakdown, reason, volume, aiAnalysis } = stock;
  const sc  = sigColor(signal);
  const bd  = breakdown ?? {};
  const chg = changePercent ?? 0;

  return (
    <div
      onClick={() => onClick(ticker)}
      style={{
        background: "var(--surf)", border: "1px solid var(--border)",
        borderRadius: 10, padding: 16, cursor: "pointer",
        transition: "border-color .2s, transform .15s, box-shadow .2s",
        position: "relative", overflow: "hidden",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "var(--border2)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,.45)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Top color bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 2, borderRadius: "10px 10px 0 0", background: sc,
      }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{ticker}</div>
          <div style={{ fontSize: ".65rem", color: "var(--muted)", marginTop: 2 }}>{COMPANY[ticker] ?? ticker}</div>
        </div>
        <span style={{
          padding: "3px 8px", borderRadius: 5, fontSize: ".67rem", fontWeight: 700, letterSpacing: ".06em",
          background: sigDim(signal), color: sc,
        }}>
          {signal}
        </span>
      </div>

      {/* Gauge */}
      <div style={{ display: "flex", justifyContent: "center", margin: "2px 0 8px" }}>
        <SignalGauge score={score ?? 0} signal={signal} />
      </div>

      {/* Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 2 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: "1.28rem", fontWeight: 500 }}>{f$(price)}</span>
        <span style={{
          fontFamily: "var(--mono)", fontSize: ".74rem",
          color: chg > 0 ? "var(--buy)" : chg < 0 ? "var(--sell)" : "var(--muted)",
        }}>
          {chg > 0 ? "+" : ""}{chg.toFixed(2)}%
        </span>
      </div>
      <div style={{ fontSize: ".65rem", color: "var(--muted)", marginBottom: 10 }}>Vol {fv(volume)}</div>

      {/* Breakdown bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, borderTop: "1px solid var(--border)", paddingTop: 9 }}>
        {[
          { label: "Momentum", key: "momentum" },
          { label: "Sentiment", key: "sentiment" },
          { label: "Volume", key: "volumeSpike" },
          { label: "News", key: "newsImpact" },
        ].map(({ label, key }) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: ".59rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)" }}>{label}</span>
            <div style={{ height: 3, background: "var(--surf2)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: sc, width: `${Math.round((bd[key] ?? 0) * 100)}%`, transition: "width .5s ease" }} />
            </div>
          </div>
        ))}
      </div>

      {reason && <div style={{ fontSize: ".65rem", color: "var(--muted)", marginTop: 7, fontStyle: "italic" }}>{reason}</div>}

      {/* AI Summary */}
      {aiAnalysis && (
        <div style={{
          marginTop: 9, padding: "8px 10px",
          background: "var(--ai-d)", border: "1px solid rgba(167,139,250,.15)",
          borderRadius: 7, fontSize: ".68rem", lineHeight: 1.45, color: "var(--dim)",
        }}>
          <div style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ai)", marginBottom: 4, fontWeight: 600 }}>
            ⬡ Claude AI
          </div>
          {aiAnalysis.summary}
        </div>
      )}
    </div>
  );
}
