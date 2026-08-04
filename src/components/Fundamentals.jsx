import { COMPANY } from "./Navbar";

const fmtNum = (v, suffix = "") => (v == null ? "—" : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`);
const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);
const fmtCap = (mil) => {
  if (mil == null) return "—";
  if (mil >= 1e6) return `$${(mil / 1e6).toFixed(2)}T`;
  if (mil >= 1e3) return `$${(mil / 1e3).toFixed(1)}B`;
  return `$${Math.round(mil)}M`;
};
const fmtVol = (v) => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`);
const Label = ({ children }) => <span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)" }}>{children}</span>;

// Rich fundamentals from Finnhub's free tier: profile, key metrics, analyst
// ratings, latest earnings, and peers.
export default function Fundamentals({ fund, onSelectPeer }) {
  if (!fund || (!fund.profile && !fund.metrics && !fund.recommendation)) return null;
  const p = fund.profile, m = fund.metrics ?? {}, rec = fund.recommendation;

  // 52-week range position (0–100%).
  const price5 = m.high52 != null && m.low52 != null ? m : null;
  const rangePct = (cur) => (price5 && cur != null && m.high52 > m.low52) ? Math.max(0, Math.min(100, ((cur - m.low52) / (m.high52 - m.low52)) * 100)) : null;

  const stats = [
    { label: "Market Cap", value: fmtCap(p?.marketCap) },
    { label: "P/E", value: fmtNum(m.pe) },
    { label: "Beta", value: fmtNum(m.beta) },
    { label: "13W Return", value: fmtPct(m.ret13w), color: m.ret13w >= 0 ? "var(--buy)" : "var(--sell)" },
    { label: "52W Return", value: fmtPct(m.ret52w), color: m.ret52w >= 0 ? "var(--buy)" : "var(--sell)" },
    { label: "Net Margin", value: m.netMargin != null ? `${m.netMargin.toFixed(1)}%` : "—" },
    { label: "ROE", value: m.roe != null ? `${m.roe.toFixed(1)}%` : "—" },
    { label: "Div Yield", value: m.divYield != null ? `${m.divYield.toFixed(2)}%` : "—" },
  ];

  const recTotal = rec ? (rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell) : 0;
  const recSegs = rec ? [
    { n: rec.strongBuy, c: "#00D4A0", label: "Strong Buy" },
    { n: rec.buy, c: "#5AD1C0", label: "Buy" },
    { n: rec.hold, c: "#F5A623", label: "Hold" },
    { n: rec.sell, c: "#FF7A59", label: "Sell" },
    { n: rec.strongSell, c: "#FF4D6A", label: "Strong Sell" },
  ] : [];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>Company &amp; Fundamentals</div>

      {/* Profile line */}
      {p && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: ".72rem", color: "var(--dim)", marginBottom: 14 }}>
          {p.industry && <span><span style={{ color: "var(--muted)" }}>Industry</span> {p.industry}</span>}
          {p.exchange && <span><span style={{ color: "var(--muted)" }}>Exchange</span> {p.exchange}</span>}
          {p.ipo && <span><span style={{ color: "var(--muted)" }}>IPO</span> {p.ipo}</span>}
          {p.weburl && <a href={p.weburl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>Website ↗</a>}
        </div>
      )}

      {/* Metric grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10, marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--surf2)", borderRadius: 8, padding: "9px 11px" }}>
            <Label>{s.label}</Label>
            <div style={{ fontFamily: "var(--mono)", fontSize: ".92rem", fontWeight: 600, color: s.color ?? "var(--text)", marginTop: 3 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 52-week range */}
      {m.high52 != null && m.low52 != null && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <Label>52-Week Range</Label>
            <span style={{ fontFamily: "var(--mono)", fontSize: ".66rem", color: "var(--muted)" }}>${m.low52} – ${m.high52}</span>
          </div>
          <div style={{ height: 5, background: "var(--surf2)", borderRadius: 3, position: "relative" }}>
            <div style={{ position: "absolute", left: `${rangePct(fund.price) ?? 50}%`, top: -3, width: 3, height: 11, borderRadius: 2, background: "var(--text)", transform: "translateX(-50%)" }} />
          </div>
        </div>
      )}

      {/* Analyst ratings */}
      {rec && recTotal > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <Label>Analyst Ratings</Label>
            <span style={{ fontSize: ".62rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>{recTotal} analysts · {rec.period}</span>
          </div>
          <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--surf2)" }}>
            {recSegs.map((s) => s.n > 0 && <div key={s.label} title={`${s.label}: ${s.n}`} style={{ width: `${(s.n / recTotal) * 100}%`, background: s.c }} />)}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            {recSegs.map((s) => (
              <span key={s.label} style={{ fontSize: ".6rem", color: "var(--dim)" }}>
                <span style={{ color: s.c, fontWeight: 700 }}>{s.n}</span> {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Earnings + insider row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {fund.lastEarnings && (
          <div style={{ flex: 1, minWidth: 150, background: "var(--surf2)", borderRadius: 8, padding: "10px 12px" }}>
            <Label>Last Earnings ({fund.lastEarnings.period})</Label>
            <div style={{ fontSize: ".78rem", marginTop: 4 }}>
              EPS <span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{fmtNum(fund.lastEarnings.actual)}</span>
              <span style={{ color: "var(--muted)" }}> vs {fmtNum(fund.lastEarnings.estimate)} est</span>
              {fund.lastEarnings.surprisePercent != null && (
                <span style={{ marginLeft: 6, color: fund.lastEarnings.surprisePercent >= 0 ? "var(--buy)" : "var(--sell)", fontWeight: 600 }}>
                  {fmtPct(fund.lastEarnings.surprisePercent)}
                </span>
              )}
            </div>
          </div>
        )}
        {fund.nextEarnings?.date && (
          <div style={{ flex: 1, minWidth: 130, background: "var(--surf2)", borderRadius: 8, padding: "10px 12px" }}>
            <Label>Next Earnings</Label>
            <div style={{ fontSize: ".78rem", marginTop: 4, fontFamily: "var(--mono)" }}>{fund.nextEarnings.date}</div>
          </div>
        )}
        {fund.insiderNet != null && fund.insiderNet !== 0 && (
          <div style={{ flex: 1, minWidth: 130, background: "var(--surf2)", borderRadius: 8, padding: "10px 12px" }}>
            <Label>Insider (recent)</Label>
            <div style={{ fontSize: ".78rem", marginTop: 4, fontFamily: "var(--mono)", color: fund.insiderNet > 0 ? "var(--buy)" : "var(--sell)" }}>
              {fund.insiderNet > 0 ? "+" : ""}{fmtVol(fund.insiderNet)} sh
            </div>
          </div>
        )}
      </div>

      {/* Peers */}
      {fund.peers?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Label>Peers</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {fund.peers.map((pt) => {
              const known = !!COMPANY[pt];
              return (
                <button key={pt} onClick={() => known && onSelectPeer?.(pt)} disabled={!known}
                  title={known ? `Open ${pt}` : pt}
                  style={{
                    padding: "3px 9px", borderRadius: 6, border: "1px solid var(--border2)",
                    background: "var(--surf2)", color: known ? "var(--blue)" : "var(--muted)",
                    fontSize: ".66rem", fontWeight: 600, cursor: known ? "pointer" : "default",
                  }}>{pt}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
