// Market Pulse — the dashboard's headline band. Shows the signal mix as a
// single distribution bar plus a few key tiles. Replaces the old flat StatStrip.

const sigColor = (s) => (s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)");

export default function MarketPulse({ summary, stocks = [], lastUpdated }) {
  const total = summary.buy + summary.hold + summary.sell;
  const pct = (n) => (total ? (n / total) * 100 : 0);

  const topBuy = stocks.find((s) => s.signal === "BUY");
  const topSell = [...stocks].reverse().find((s) => s.signal === "SELL");

  const lastTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const segs = [
    { key: "BUY", n: summary.buy, c: "var(--buy)" },
    { key: "HOLD", n: summary.hold, c: "var(--hold)" },
    { key: "SELL", n: summary.sell, c: "var(--sell)" },
  ];

  return (
    <div style={{ padding: "18px 28px 6px" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(280px, 1.6fr) repeat(3, minmax(120px, 1fr))",
        gap: 12, alignItems: "stretch",
      }}>
        {/* Distribution */}
        <Tile>
          <Label>Signal Distribution</Label>
          <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--surf2)", marginTop: 10, marginBottom: 12 }}>
            {segs.map((s) => (
              <div key={s.key} title={`${s.key} ${s.n}`} style={{
                width: `${pct(s.n)}%`, background: s.c, transition: "width .5s cubic-bezier(.22,1,.36,1)",
              }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            {segs.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: s.c }} />
                <span style={{ fontSize: ".7rem", color: "var(--dim)" }}>{s.key}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: ".8rem", fontWeight: 600, color: s.c }}>{s.n}</span>
              </div>
            ))}
          </div>
        </Tile>

        {/* Avg score */}
        <Tile>
          <Label>Avg Score</Label>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "1.9rem", fontWeight: 600 }}>{summary.avg}</span>
            <span style={{ fontSize: ".7rem", color: "var(--muted)" }}>/ 100</span>
          </div>
          <div style={{ height: 3, background: "var(--surf2)", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
            <div style={{ height: "100%", width: `${summary.avg}%`, background: summary.avg >= 55 ? "var(--buy)" : summary.avg >= 45 ? "var(--hold)" : "var(--sell)", transition: "width .5s" }} />
          </div>
        </Tile>

        {/* Top buy */}
        <Tile accent="var(--buy)">
          <Label>Strongest Signal</Label>
          {topBuy ? <Mover s={topBuy} /> : <Empty />}
        </Tile>

        {/* Top sell */}
        <Tile accent="var(--sell)">
          <Label>Weakest Signal</Label>
          {topSell ? <Mover s={topSell} /> : <Empty />}
        </Tile>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <span style={{ fontSize: ".64rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
          Tracking {total} · Last run {lastTime}
        </span>
      </div>
    </div>
  );
}

function Tile({ children, accent }) {
  return (
    <div className="fade-up" style={{
      background: "linear-gradient(180deg, var(--surf), rgba(15,22,40,.6))",
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      padding: "13px 16px", position: "relative", overflow: "hidden",
    }}>
      {accent && <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: accent }} />}
      {children}
    </div>
  );
}
function Label({ children }) {
  return <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)", fontWeight: 600 }}>{children}</span>;
}
function Mover({ s }) {
  const c = sigColor(s.signal);
  const chg = s.changePercent ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
      <div>
        <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{s.ticker}</div>
        <div style={{ fontSize: ".66rem", fontFamily: "var(--mono)", color: chg >= 0 ? "var(--buy)" : "var(--sell)" }}>
          {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: "1.3rem", fontWeight: 700, color: c }}>{Math.round((s.score ?? 0) * 100)}</div>
        <div style={{ fontSize: ".58rem", fontWeight: 700, letterSpacing: ".06em", color: c }}>{s.signal}</div>
      </div>
    </div>
  );
}
function Empty() {
  return <div style={{ marginTop: 12, fontSize: ".78rem", color: "var(--muted)" }}>—</div>;
}
