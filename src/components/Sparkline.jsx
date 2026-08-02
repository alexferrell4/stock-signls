// Tiny dependency-free sparkline. Renders a score series (0–1 values) as a
// smooth area+line. Used on cards and table rows where a full chart would be
// overkill.
export default function Sparkline({ data = [], color = "var(--dim)", width = 96, height = 28 }) {
  const pts = data.filter((n) => typeof n === "number");
  if (pts.length < 2) {
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2}
          stroke="var(--border2)" strokeWidth="1.5" strokeDasharray="2 3" />
      </svg>
    );
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const pad = 3;
  const x = (i) => (i / (pts.length - 1)) * (width - pad * 2) + pad;
  const y = (v) => height - pad - ((v - min) / range) * (height - pad * 2);

  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const id = `spk-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="2.4" fill={color} />
    </svg>
  );
}
