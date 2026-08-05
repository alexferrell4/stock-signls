export default function StatStrip({ summary, lastUpdated }) {
  const lastTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const stats = [
    { label: "Tracking",  value: `${summary.buy + summary.hold + summary.sell} stocks`, color: "var(--dim)" },
    { label: "Buy",       value: summary.buy,  color: "var(--buy)"  },
    { label: "Hold",      value: summary.hold, color: "var(--hold)" },
    { label: "Sell",      value: summary.sell, color: "var(--sell)" },
    { label: "Avg Score", value: summary.avg,  color: "var(--dim)"  },
    { label: "Last Run",  value: lastTime,     color: "var(--dim)", small: true },
  ];

  return (
    <div style={{
      display: "flex", borderBottom: "1px solid var(--border)", overflowX: "auto",
    }}>
      {stats.map(({ label, value, color, small }) => (
        <div key={label} style={{
          display: "flex", flexDirection: "column", gap: 3,
          padding: "11px 22px", borderRight: "1px solid var(--border)", whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)" }}>
            {label}
          </span>
          <span style={{
            fontFamily: "var(--mono)", fontSize: small ? ".72rem" : ".9rem",
            fontWeight: 500, color,
          }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
