import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import SignalGauge from "./SignalGauge";
import ChatBox from "./ChatBox";
import { fetchStock } from "../lib/api";
import { COMPANY } from "./Navbar";

const f$ = p => p != null ? `$${Number(p).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const sigColor = s => s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)";
const sigDim   = s => s === "BUY" ? "var(--buy-d)" : s === "SELL" ? "var(--sell-d)" : "var(--hold-d)";

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surf2)", border: "1px solid var(--border2)",
      borderRadius: 8, padding: "8px 12px", fontSize: ".75rem", fontFamily: "var(--mono)",
    }}>
      <div style={{ color: "var(--muted)", marginBottom: 3 }}>{payload[0]?.payload?.time}</div>
      <div style={{ color: "var(--text)", fontWeight: 600 }}>Score: {Math.round((payload[0]?.value ?? 0) * 100)}</div>
      {payload[0]?.payload?.signal && (
        <div style={{ color: sigColor(payload[0].payload.signal), marginTop: 2 }}>{payload[0].payload.signal}</div>
      )}
    </div>
  );
}

export default function StockModal({ ticker, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await fetchStock(ticker);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    load();
    const handleKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [load, onClose]);

  const s  = data?.stock;
  const news = data?.news ?? [];
  const sc = s ? sigColor(s.signal) : "var(--hold)";
  const bd = s?.breakdown ?? {};
  const ai = s?.aiAnalysis;
  const chg = s?.changePercent ?? 0;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(4,8,20,.88)",
        backdropFilter: "blur(7px)", zIndex: 200,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "24px 16px", overflowY: "auto",
      }}
    >
      <div style={{
        background: "var(--surf)", border: "1px solid var(--border2)",
        borderRadius: 14, width: "100%", maxWidth: 780,
        padding: 26, position: "relative", margin: "auto",
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14,
          background: "var(--surf2)", border: "1px solid var(--border)",
          borderRadius: 6, color: "var(--dim)", fontSize: "1rem",
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}>✕</button>

        {loading ? (
          <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Loading {ticker}...</div>
        ) : !s ? (
          <div style={{ color: "var(--sell)", padding: 40, textAlign: "center" }}>Failed to load {ticker}</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <span style={{ fontSize: "1.9rem", fontWeight: 700 }}>{ticker}</span>
              <span style={{ padding: "4px 11px", borderRadius: 5, fontSize: ".78rem", fontWeight: 700, background: sigDim(s.signal), color: sc }}>{s.signal}</span>
              <span style={{ padding: "3px 8px", borderRadius: 5, background: "var(--ai-d)", color: "var(--ai)", fontSize: ".62rem", fontWeight: 700, letterSpacing: ".07em" }}>AI</span>
            </div>
            <div style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 16 }}>{COMPANY[ticker] ?? ticker}</div>

            {/* Key stats */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
              {[
                { label: "Price",    value: f$(s.price) },
                { label: "Change",   value: `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`, color: chg > 0 ? "var(--buy)" : chg < 0 ? "var(--sell)" : "var(--dim)" },
                { label: "High",     value: f$(s.high) },
                { label: "Low",      value: f$(s.low) },
                { label: "Score",    value: Math.round((s.score ?? 0) * 100), color: sc },
                { label: "Sentiment",value: s.finnhubSentiment?.toFixed(2) ?? "—", color: (s.finnhubSentiment ?? 0) > 0 ? "var(--buy)" : "var(--sell)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)" }}>{label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "1rem", fontWeight: 500, color: color ?? "var(--text)" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Gauge */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <SignalGauge score={s.score ?? 0} signal={s.signal} size={120} />
            </div>

            {/* AI Analysis */}
            {ai && (
              <>
                <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>⬡ Claude AI Analysis</div>
                <div style={{ background: "var(--ai-d)", border: "1px solid rgba(167,139,250,.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ai)" }}>AI Analyst</span>
                    <span style={{
                      padding: "2px 7px", borderRadius: 4, fontSize: ".62rem", fontWeight: 700,
                      background: ai.confidence === "High" ? "var(--buy-d)" : ai.confidence === "Low" ? "var(--sell-d)" : "var(--hold-d)",
                      color: ai.confidence === "High" ? "var(--buy)" : ai.confidence === "Low" ? "var(--sell)" : "var(--hold)",
                    }}>
                      {ai.confidence} Confidence
                    </span>
                  </div>
                  <div style={{ fontSize: ".8rem", lineHeight: 1.6, color: "var(--dim)", marginBottom: 10 }}>{ai.summary}</div>
                  <div style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", marginBottom: 4 }}>Key Risk / Opportunity</div>
                  <div style={{ fontSize: ".78rem", color: "var(--text)", lineHeight: 1.5 }}>{ai.keyRisk}</div>
                </div>
              </>
            )}

            {/* Score Breakdown */}
            <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>Score Breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
              {[
                { label: "Momentum (40%)",     key: "momentum" },
                { label: "Sentiment (30%)",    key: "sentiment" },
                { label: "Volume spike (20%)", key: "volumeSpike" },
                { label: "News impact (10%)",  key: "newsImpact" },
              ].map(({ label, key }) => {
                const val = bd[key] ?? 0;
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", color: "var(--dim)", marginBottom: 4 }}>
                      <span>{label}</span>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{Math.round(val * 100)}</span>
                    </div>
                    <div style={{ height: 4, background: "var(--surf2)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: sc, width: `${Math.round(val * 100)}%`, transition: "width .5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat */}
            <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>
              Ask Claude about {ticker}
            </div>
            <ChatBox ticker={ticker} />

            {/* News */}
            <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", margin: "20px 0 10px" }}>Recent News</div>
            {news.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "var(--muted)" }}>No news loaded.</div>
            ) : news.map((item, i) => {
              const sc2 = item.sentiment > .1 ? "pos" : item.sentiment < -.1 ? "neg" : "neu";
              const sentColor = { pos: "var(--buy)", neg: "var(--sell)", neu: "var(--muted)" }[sc2];
              const sentBg    = { pos: "var(--buy-d)", neg: "var(--sell-d)", neu: "var(--surf2)" }[sc2];
              const sentLabel = { pos: "Positive", neg: "Negative", neu: "Neutral" }[sc2];
              return (
                <div key={i} style={{ padding: "11px 0", borderBottom: i < news.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ fontSize: ".8rem", lineHeight: 1.45, marginBottom: 4 }}>
                    {item.url
                      ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "none" }}
                          onMouseEnter={e => e.target.style.color = "var(--blue)"}
                          onMouseLeave={e => e.target.style.color = "var(--text)"}>{item.headline}</a>
                      : item.headline}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".64rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
                    <span>{item.source}</span>
                    <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: ".59rem", fontWeight: 700, background: sentBg, color: sentColor }}>{sentLabel}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
