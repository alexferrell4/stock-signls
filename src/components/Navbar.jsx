import { useClock } from "../hooks/useClock";
import AlertsBell from "./AlertsBell";
import { marketSession, fmtMins } from "../lib/killzone";

// Keep in sync with src/server/universe.js UNIVERSE.
const COMPANY = {
  AAPL:"Apple Inc.", MSFT:"Microsoft Corp.", TSLA:"Tesla Inc.", GOOGL:"Alphabet Inc.",
  AMZN:"Amazon.com", META:"Meta Platforms", NVDA:"NVIDIA Corp.", AMD:"AMD",
  NFLX:"Netflix Inc.", COIN:"Coinbase", PLTR:"Palantir", SOFI:"SoFi",
  RIVN:"Rivian", SMCI:"Super Micro Computer", MSTR:"MicroStrategy",
  JPM:"JPMorgan Chase", V:"Visa Inc.", WMT:"Walmart Inc.", DIS:"Walt Disney Co.",
  BA:"Boeing Co.", XOM:"Exxon Mobil", INTC:"Intel Corp.", CRM:"Salesforce Inc.",
  ORCL:"Oracle Corp.", ADBE:"Adobe Inc.", UBER:"Uber Technologies", PYPL:"PayPal Holdings",
  SHOP:"Shopify Inc.", QCOM:"Qualcomm Inc.", BABA:"Alibaba Group",
};

export { COMPANY };

export default function Navbar({ nextUpdate, onRefresh, refreshing, onSelect }) {
  const time = useClock();
  const mkt = marketSession(); // recomputed each second via useClock re-render
  const sessColor = mkt.regularOpen ? "var(--buy)" : mkt.premarket || mkt.afterHours ? "var(--hold)" : "var(--muted)";

  const minsLeft = nextUpdate
    ? Math.max(0, Math.round((new Date(nextUpdate) - Date.now()) / 60000))
    : null;

  return (
    <nav style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 28px",
      borderBottom: "1px solid var(--border)",
      background: "rgba(8,13,26,.96)",
      backdropFilter: "blur(10px)",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: ".95rem" }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: "var(--buy)", boxShadow: "0 0 8px var(--buy)",
          animation: "pulse 2.5s ease-in-out infinite",
          display: "inline-block",
        }} />
        Trendline
        <span style={{
          padding: "3px 8px", borderRadius: 5,
          background: "var(--ai-d)", color: "var(--ai)",
          fontSize: ".62rem", fontWeight: 700, letterSpacing: ".07em",
        }}>
          AI
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: ".72rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--dim)" }} title={`New York ${mkt.etTime} ET`}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: sessColor, boxShadow: `0 0 6px ${sessColor}` }} />
          {mkt.session}
        </span>
        {mkt.inKillzone && (
          <span title={`${mkt.next?.label} ${fmtMins(mkt.next?.mins)}`} style={{
            padding: "2px 8px", borderRadius: 5, fontWeight: 700, fontSize: ".62rem", letterSpacing: ".03em",
            color: mkt.killzoneColor, background: "var(--surf2)", border: `1px solid ${mkt.killzoneColor}`,
          }}>⚡ {mkt.killzone} KZ</span>
        )}
        {minsLeft !== null && (
          <span style={{ color: "var(--dim)" }}>
            Next update ~{minsLeft}m
          </span>
        )}
        <span>{time}</span>
        <AlertsBell onSelect={onSelect} />
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", border: "1px solid var(--border2)",
            borderRadius: 7, background: "transparent",
            color: refreshing ? "var(--muted)" : "var(--dim)",
            fontFamily: "var(--sans)", fontSize: ".72rem", fontWeight: 500,
            cursor: refreshing ? "default" : "pointer", transition: "all .15s",
          }}
          onMouseEnter={e => { if (!refreshing) e.currentTarget.style.color = "var(--blue)"; e.currentTarget.style.borderColor = "var(--blue)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = refreshing ? "var(--muted)" : "var(--dim)"; e.currentTarget.style.borderColor = "var(--border2)"; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: refreshing ? "spin .7s linear infinite" : "none" }}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </nav>
  );
}
