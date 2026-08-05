import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, ComposedChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";
import SignalGauge from "./SignalGauge";
import ChatBox from "./ChatBox";
import Fundamentals from "./Fundamentals";
import Technicals from "./Technicals";
import { fetchStock, fetchChart, fetchFundamentals } from "../lib/api";
import { useDrawings } from "../hooks/useDrawings";
import { COMPANY } from "./Navbar";

const ALL_TICKERS = Object.keys(COMPANY);
const PEER_COLORS = ["#4F8EF7", "#A78BFA", "#F5A623", "#FF7AC6", "#5AD1C0"];
const DRAW_COLOR = "#A78BFA";

const segBtn = (active) => ({
  padding: "3px 10px", border: "none", borderRadius: 5,
  background: active ? "var(--surf3)" : "transparent",
  color: active ? "var(--text)" : "var(--muted)",
  fontFamily: "var(--sans)", fontSize: ".66rem", fontWeight: 600, cursor: "pointer",
});
const chip = (active, color) => ({
  padding: "3px 10px", borderRadius: 20, cursor: "pointer", background: "transparent",
  border: `1px solid ${active ? color : "var(--border2)"}`,
  color: active ? color : "var(--muted)",
  fontFamily: "var(--sans)", fontSize: ".64rem", fontWeight: 700,
});

const f$ = p => p != null ? `$${Number(p).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const sigColor = s => s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : "var(--hold)";
const sigDim   = s => s === "BUY" ? "var(--buy-d)" : s === "SELL" ? "var(--sell-d)" : "var(--hold-d)";
const sigHex   = s => s === "BUY" ? "#00D4A0" : s === "SELL" ? "#FF4D6A" : "#F5A623";
const r2 = (v) => Math.round(v * 100) / 100;

// Custom candlestick shape for a recharts range Bar (dataKey = [low, high]).
// recharts positions y at `high` and height down to `low`; we interpolate the
// open/close pixels within that span to draw the body.
function Candle({ x, y, width, height, payload }) {
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const color = close >= open ? "#00D4A0" : "#FF4D6A";
  const span = (high - low) || 1;
  const pxFor = (v) => y + ((high - v) / span) * height;
  const cx = x + width / 2;
  const bodyTop = pxFor(Math.max(open, close));
  const bodyBot = pxFor(Math.min(open, close));
  const bw = Math.max(2, width * 0.6);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth="1" />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={Math.max(1, bodyBot - bodyTop)} fill={color} />
    </g>
  );
}

function OHLCTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", fontSize: ".68rem", fontFamily: "var(--mono)" }}>
      <div style={{ color: "var(--muted)", marginBottom: 3 }}>{d.date}</div>
      <div style={{ color: "var(--dim)" }}>O {d.open}&nbsp; H {d.high}</div>
      <div style={{ color: "var(--dim)" }}>L {d.low}&nbsp; C <span style={{ color: "var(--text)", fontWeight: 600 }}>{d.close}</span></div>
    </div>
  );
}

function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surf2)", border: "1px solid var(--border2)",
      borderRadius: 8, padding: "6px 10px", fontSize: ".72rem", fontFamily: "var(--mono)",
    }}>
      <div style={{ color: "var(--muted)", marginBottom: 2 }}>{payload[0]?.payload?.date}</div>
      <div style={{ color: "var(--text)", fontWeight: 600 }}>${Number(payload[0]?.value ?? 0).toFixed(2)}</div>
    </div>
  );
}

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

export default function StockModal({ ticker, timeframe = "daily", onClose, onSelectTicker }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [chart, setChart]   = useState([]);
  const [fund, setFund]     = useState(null);
  const [indexSeries, setIndexSeries] = useState([]);
  const [peerSeries, setPeerSeries] = useState([]);
  const [peers, setPeers] = useState([]);          // added compare tickers
  const [showIndex, setShowIndex] = useState(true); // include S&P in compare
  const [chartType, setChartType] = useState("area"); // area | candles
  const [compare, setCompare] = useState(false);
  const [tool, setTool] = useState("none");         // none | hline | trend
  const [pending, setPending] = useState(null);     // first click of a trendline
  const { drawings, add: addDrawing, clear: clearDrawings, undo: undoDrawing } = useDrawings(ticker, timeframe);

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

  // Chart range follows the selected timeframe (intraday / 5-day / 1-month);
  // refetches with the S&P 500 series when comparison is on.
  useEffect(() => {
    let cancelled = false;
    setChart([]); setIndexSeries([]); setPeerSeries([]);
    fetchChart(ticker, timeframe, { compare: compare && showIndex, peers: compare ? peers : [] })
      .then((r) => { if (!cancelled) { setChart(r.series ?? []); setIndexSeries(r.index?.series ?? []); setPeerSeries(r.peers ?? []); } })
      .catch(() => { if (!cancelled) { setChart([]); setIndexSeries([]); setPeerSeries([]); } });
    return () => { cancelled = true; };
  }, [ticker, timeframe, compare, showIndex, peers]);

  // Reset the pending trendline point whenever the drawing tool changes.
  useEffect(() => { setPending(null); }, [tool, ticker, timeframe]);

  // Company fundamentals (on demand).
  useEffect(() => {
    let cancelled = false;
    setFund(null);
    fetchFundamentals(ticker).then((f) => { if (!cancelled) setFund(f); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  // Project the selected timeframe over the stock (see App.jsx tfStocks).
  const s  = data?.stock ? { ...data.stock, ...(data.stock.timeframes?.[timeframe] ?? {}) } : null;
  const news = data?.news ?? [];
  const fmtLabel = (t) => {
    const d = new Date(t);
    if (timeframe === "daily") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (timeframe === "weekly") return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const chartData = chart.map((p) => ({ date: fmtLabel(p.t), price: p.close }));
  const candleData = chart.map((p) => ({ date: fmtLabel(p.t), open: p.open, high: p.high, low: p.low, close: p.close, range: [p.low, p.high] }));
  const candleDomain = chart.length
    ? [Math.min(...chart.map((p) => p.low)), Math.max(...chart.map((p) => p.high))]
    : [0, 1];
  // Relative-performance overlay: base stock + optional S&P + peer tickers,
  // each normalized to % from its first point onto a shared % axis.
  const compareSeries = compare ? [
    { key: "stock", label: ticker, color: sigColor(s?.signal), series: chart },
    ...(showIndex && indexSeries.length >= 2 ? [{ key: "index", label: "S&P 500", color: "var(--dim)", dashed: true, series: indexSeries }] : []),
    ...peerSeries.map((p, i) => ({ key: p.symbol, label: p.symbol, color: PEER_COLORS[i % PEER_COLORS.length], series: p.series })),
  ].filter((cs) => cs.series.length >= 2) : [];
  const compareData = (() => {
    if (!compare || compareSeries.length === 0) return [];
    const n = Math.min(...compareSeries.map((cs) => cs.series.length));
    const out = [];
    for (let k = 0; k < n; k++) {
      const row = { date: fmtLabel(chart[k].t) };
      for (const cs of compareSeries) { const base = cs.series[0].close; row[cs.key] = r2((cs.series[k].close / base - 1) * 100); }
      out.push(row);
    }
    return out;
  })();
  const chartTitle = compare ? "vs S&P 500 (relative)"
    : timeframe === "daily" ? "Price — today" : timeframe === "weekly" ? "Price — past week" : "Price — past month";
  const history = data?.history ?? [];
  const sc = s ? sigColor(s.signal) : "var(--hold)";
  const bd = s?.breakdown ?? {};
  const ex = s?.explanation;
  const ai = s?.aiAnalysis;
  const chg = s?.changePercent ?? 0;

  // Click-to-draw: snap to the nearest bar's price. hline drops a level;
  // trend needs two clicks (from → to).
  const onChartClick = (e) => {
    if (tool === "none" || !e?.activePayload?.length) return;
    const p = e.activePayload[0].payload;
    const y = p.close ?? p.price, x = p.date;
    if (y == null || x == null) return;
    if (tool === "hline") addDrawing({ type: "hline", y: r2(y) });
    else if (tool === "trend") {
      if (!pending) setPending({ x, y: r2(y) });
      else { addDrawing({ type: "trend", from: pending, to: { x, y: r2(y) } }); setPending(null); }
    }
  };

  // Horizontal levels render as ReferenceLines; trendlines are injected as an
  // interpolated line series (reliable on a category x-axis, unlike segments).
  const hlineEls = drawings.map((d, i) => d.type === "hline"
    ? <ReferenceLine key={`h${i}`} y={d.y} stroke={DRAW_COLOR} strokeDasharray="5 4" strokeWidth={1.2}
        label={{ value: `$${d.y}`, position: "right", fontSize: 9, fill: DRAW_COLOR }} />
    : null);
  const trendKeys = drawings.map((d, i) => (d.type === "trend" ? `trend${i}` : null)).filter(Boolean);
  const withTrends = (base) => {
    const dates = base.map((r) => r.date);
    const rows = base.map((r) => ({ ...r }));
    drawings.forEach((d, i) => {
      if (d.type !== "trend") return;
      let a = dates.indexOf(d.from.x), b = dates.indexOf(d.to.x);
      if (a < 0 || b < 0) return;
      if (a > b) { [a, b] = [b, a]; }
      const y1 = dates.indexOf(d.from.x) <= dates.indexOf(d.to.x) ? d.from.y : d.to.y;
      const y2 = dates.indexOf(d.from.x) <= dates.indexOf(d.to.x) ? d.to.y : d.from.y;
      for (let j = a; j <= b; j++) rows[j][`trend${i}`] = r2(y1 + (y2 - y1) * ((j - a) / (b - a || 1)));
    });
    return rows;
  };
  const trendLines = trendKeys.map((k) => (
    <Line key={k} type="linear" dataKey={k} stroke={DRAW_COLOR} strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
  ));

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
              <span style={{ padding: "3px 8px", borderRadius: 5, background: "var(--surf2)", color: "var(--blue)", fontSize: ".62rem", fontWeight: 700, letterSpacing: ".05em", textTransform: "capitalize" }}>{timeframe}</span>
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

            {/* Price chart */}
            {chart.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)" }}>{chartTitle}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {!compare && (
                      <>
                        {/* Line / Candles */}
                        <div style={{ display: "flex", gap: 2, background: "var(--surf2)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 }}>
                          {[["area", "Line"], ["candles", "Candles"]].map(([t, label]) => (
                            <button key={t} onClick={() => setChartType(t)} style={segBtn(chartType === t)}>{label}</button>
                          ))}
                        </div>
                        {/* Drawing tools */}
                        <div style={{ display: "flex", gap: 2, background: "var(--surf2)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 }}>
                          <button onClick={() => setTool((v) => v === "hline" ? "none" : "hline")} title="Horizontal level" style={segBtn(tool === "hline")}>― Level</button>
                          <button onClick={() => setTool((v) => v === "trend" ? "none" : "trend")} title="Trendline" style={segBtn(tool === "trend")}>╱ Trend</button>
                          {drawings.length > 0 && <button onClick={undoDrawing} title="Undo" style={segBtn(false)}>⤺</button>}
                          {drawings.length > 0 && <button onClick={clearDrawings} title="Clear all" style={segBtn(false)}>Clear</button>}
                        </div>
                      </>
                    )}
                    {/* Compare */}
                    <button onClick={() => { setCompare((c) => !c); setTool("none"); }} title="Compare performance" style={{
                      padding: "4px 11px", borderRadius: 7,
                      border: `1px solid ${compare ? "var(--blue)" : "var(--border2)"}`,
                      background: compare ? "var(--blue-d)" : "transparent",
                      color: compare ? "var(--blue)" : "var(--muted)",
                      fontFamily: "var(--sans)", fontSize: ".66rem", fontWeight: 600, cursor: "pointer",
                    }}>Compare</button>
                  </div>
                </div>

                {/* Compare tray: S&P toggle + peer chips + add */}
                {compare && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    <button onClick={() => setShowIndex((v) => !v)} style={chip(showIndex, "var(--dim)")}>S&amp;P 500 {showIndex ? "✓" : ""}</button>
                    {peers.map((p, i) => (
                      <button key={p} onClick={() => setPeers((ps) => ps.filter((x) => x !== p))} style={chip(true, PEER_COLORS[i % PEER_COLORS.length])}>{p} ✕</button>
                    ))}
                    {peers.length < 4 && (
                      <select value="" onChange={(e) => { const v = e.target.value; if (v) setPeers((ps) => [...new Set([...ps, v])].slice(0, 4)); }}
                        style={{ background: "var(--surf2)", border: "1px dashed var(--border2)", borderRadius: 20, padding: "3px 10px", color: "var(--muted)", fontSize: ".64rem", cursor: "pointer" }}>
                        <option value="">+ Add ticker</option>
                        {ALL_TICKERS.filter((t) => t !== ticker && !peers.includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {/* Drawing hint */}
                {!compare && tool !== "none" && (
                  <div style={{ fontSize: ".64rem", color: "var(--ai)", marginBottom: 6 }}>
                    {tool === "hline" ? "Click the chart to drop a price level"
                      : pending ? "Click the second point of the trendline" : "Click the first point of the trendline"}
                  </div>
                )}

                <div style={{ cursor: !compare && tool !== "none" ? "crosshair" : "default" }}>
                  <ResponsiveContainer width="100%" height={190}>
                    {compare ? (
                      <LineChart data={compareData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={38} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => (v >= 0 ? "+" : "") + Math.round(v) + "%"} />
                        <ReferenceLine y={0} stroke="var(--border2)" />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div style={{ background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", fontSize: ".68rem", fontFamily: "var(--mono)" }}>
                              <div style={{ color: "var(--muted)", marginBottom: 3 }}>{payload[0].payload.date}</div>
                              {payload.map((pl) => (
                                <div key={pl.dataKey} style={{ color: pl.color || pl.stroke, fontWeight: 600 }}>{pl.name} {pl.value >= 0 ? "+" : ""}{pl.value}%</div>
                              ))}
                            </div>
                          );
                        }} />
                        <Legend wrapperStyle={{ fontSize: ".62rem" }} />
                        {compareSeries.map((cs) => (
                          <Line key={cs.key} type="monotone" dataKey={cs.key} name={cs.label} stroke={cs.color}
                            strokeWidth={cs.key === "stock" ? 2 : 1.5} strokeDasharray={cs.dashed ? "4 3" : undefined} dot={false} isAnimationActive={false} />
                        ))}
                      </LineChart>
                    ) : chartType === "candles" ? (
                      <ComposedChart data={withTrends(candleData)} onClick={onChartClick} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={38} />
                        <YAxis domain={candleDomain} tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => "$" + Math.round(v)} />
                        <Tooltip content={<OHLCTooltip />} cursor={{ fill: "rgba(255,255,255,.03)" }} />
                        {hlineEls}
                        <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
                        {trendLines}
                      </ComposedChart>
                    ) : (
                      <AreaChart data={withTrends(chartData)} onClick={onChartClick} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="tl-price-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={sc} stopOpacity={0.32} />
                            <stop offset="100%" stopColor={sc} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={38} />
                        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => "$" + Math.round(v)} />
                        <Tooltip content={<PriceTooltip />} />
                        {hlineEls}
                        <Area type="monotone" dataKey="price" stroke={sc} strokeWidth={2} fill="url(#tl-price-grad)" />
                        {trendLines}
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Technicals & levels */}
            <Technicals tech={s.technicals} changeFromOpen={s.changeFromOpen} premarket={fund?.premarket} price={s.price} />

            {/* Gauge */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <SignalGauge score={s.score ?? 0} signal={s.signal} size={120} />
            </div>

            {/* Score history */}
            {history.length > 1 && (
              <>
                <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>Score History</div>
                <div style={{ height: 140, marginBottom: 20 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={sc} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={sc} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis domain={[0, 1]} tickFormatter={(v) => Math.round(v * 100)} tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0.65} stroke="var(--buy)" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <ReferenceLine y={0.45} stroke="var(--sell)" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Area type="monotone" dataKey="score" stroke={sc} strokeWidth={2} fill="url(#scoreFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* AI Analysis */}
            {ai && (
              <>
                <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>⬡ Enhanced Analysis</div>
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

            {/* Why this score — auditable decomposition */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)" }}>Why this score</span>
              {ex && (
                <span style={{ fontSize: ".68rem", fontFamily: "var(--mono)", color: "var(--muted)" }}>
                  neutral 50 <span style={{ color: ex.net >= 0 ? "var(--buy)" : "var(--sell)", fontWeight: 700 }}>{ex.net >= 0 ? "+" : ""}{ex.net}</span> = <span style={{ color: sc, fontWeight: 700 }}>{ex.total}</span>
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 20 }}>
              {(ex?.components ?? [
                { key: "momentum", label: "Momentum", weightPct: 40, normalized: Math.round((bd.momentum ?? 0) * 100), delta: 0, detail: "" },
                { key: "sentiment", label: "Sentiment", weightPct: 30, normalized: Math.round((bd.sentiment ?? 0) * 100), delta: 0, detail: "" },
                { key: "volumeSpike", label: "Volume", weightPct: 20, normalized: Math.round((bd.volumeSpike ?? 0) * 100), delta: 0, detail: "" },
                { key: "newsImpact", label: "News", weightPct: 10, normalized: Math.round((bd.newsImpact ?? 0) * 100), delta: 0, detail: "" },
              ]).map((c) => {
                const deltaColor = c.delta > 0 ? "var(--buy)" : c.delta < 0 ? "var(--sell)" : "var(--muted)";
                return (
                  <div key={c.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: ".72rem", color: "var(--dim)", marginBottom: 4 }}>
                      <span>{c.label} <span style={{ color: "var(--muted)", fontSize: ".64rem" }}>({c.weightPct}%)</span></span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "var(--muted)", fontSize: ".66rem" }}>{c.detail}</span>
                        <span style={{
                          fontFamily: "var(--mono)", fontWeight: 700, fontSize: ".68rem",
                          padding: "1px 6px", borderRadius: 4, color: deltaColor,
                          background: c.delta > 0 ? "var(--buy-d)" : c.delta < 0 ? "var(--sell-d)" : "var(--surf2)",
                        }}>{c.delta >= 0 ? "+" : ""}{c.delta} pts</span>
                      </span>
                    </div>
                    <div style={{ height: 4, background: "var(--surf2)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: sc, width: `${c.normalized}%`, transition: "width .5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fundamentals */}
            <Fundamentals fund={fund ? { ...fund, price: s.price } : null} onSelectPeer={(t) => onSelectTicker?.(t)} />

            {/* Chat */}
            <div style={{ fontSize: ".63rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>
              Ask about {ticker}
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
