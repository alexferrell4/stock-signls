export default function SignalGauge({ score = 0, signal = "HOLD", size = 88 }) {
  const r = 33, cx = 50, cy = 52, sw = 6;
  const startDeg = -205, totalDeg = 230;
  const toRad = d => (d * Math.PI) / 180;
  const pt = d => ({ x: cx + r * Math.cos(toRad(d)), y: cy + r * Math.sin(toRad(d)) });

  const s   = pt(startDeg);
  const te  = pt(startDeg + totalDeg);
  const e   = pt(startDeg + totalDeg * score);
  const la  = totalDeg > 180 ? 1 : 0;
  const la2 = totalDeg * score > 180 ? 1 : 0;

  const color = signal === "BUY" ? "#00D4A0" : signal === "SELL" ? "#FF4D6A" : "#F5A623";
  const trackD = `M${s.x},${s.y} A${r},${r} 0 ${la} 1 ${te.x},${te.y}`;
  const fillD  = score > 0.01 ? `M${s.x},${s.y} A${r},${r} 0 ${la2} 1 ${e.x},${e.y}` : "";

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path d={trackD} fill="none" stroke="#162035" strokeWidth={sw} strokeLinecap="round" />
      {fillD && (
        <path
          d={fillD} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}
        />
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
        fontSize="16" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        {Math.round(score * 100)}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#4A6080"
        fontSize="7" fontFamily="Space Grotesk, sans-serif" letterSpacing=".1em">
        SCORE
      </text>
    </svg>
  );
}
