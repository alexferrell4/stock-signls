import { useState } from "react";
import { COMPANY } from "./Navbar";

const TICKERS = Object.keys(COMPANY);
const f$ = (v) => (v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const sigColor = (s) => (s === "BUY" ? "var(--buy)" : s === "SELL" ? "var(--sell)" : s === "HOLD" ? "var(--hold)" : "var(--muted)");
const sigDim = (s) => (s === "BUY" ? "var(--buy-d)" : s === "SELL" ? "var(--sell-d)" : "var(--hold-d)");
const plColor = (v) => (v == null ? "var(--muted)" : v > 0 ? "var(--buy)" : v < 0 ? "var(--sell)" : "var(--dim)");

export default function Portfolio({ portfolio, loading, error, onAdd, onRemove, onSelect }) {
  const [ticker, setTicker] = useState("AAPL");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState(null);

  const data = portfolio;
  const positions = data?.positions ?? [];
  const s = data?.summary;

  const submit = async () => {
    setFormErr(null);
    const sh = Number(shares), cb = Number(cost);
    if (!(sh > 0) || !(cb > 0)) { setFormErr("Enter positive shares and cost basis."); return; }
    setBusy(true);
    try {
      await onAdd(ticker, sh, cb);
      setShares(""); setCost("");
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "18px 28px 48px" }}>
      {/* Roll-up */}
      {s && s.count > 0 && (
        <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
          <SumTile label="Portfolio Value" value={f$(s.totalValue)} />
          <SumTile label="Total P&L" value={`${s.totalPl >= 0 ? "+" : ""}${f$(s.totalPl).replace("$", "$")}`} color={plColor(s.totalPl)}
            sub={`${s.totalPlPct >= 0 ? "+" : ""}${s.totalPlPct}%`} subColor={plColor(s.totalPl)} />
          <SumTile label="Cost Basis" value={f$(s.totalCost)} />
          <div style={{ background: "linear-gradient(180deg, var(--surf), rgba(15,22,40,.6))", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "13px 16px" }}>
            <Label>Signal Exposure</Label>
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--surf2)", margin: "10px 0 8px" }}>
              {["BUY", "HOLD", "SELL"].map((k) => (
                <div key={k} style={{ width: `${s.exposurePct[k]}%`, background: sigColor(k), transition: "width .5s" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {["BUY", "HOLD", "SELL"].map((k) => (
                <span key={k} style={{ fontSize: ".64rem", color: "var(--dim)" }}>
                  <span style={{ color: sigColor(k), fontWeight: 700 }}>{s.exposurePct[k]}%</span> {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SELL alerts */}
      {s?.alerts?.length > 0 && (
        <div className="fade-up" style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "var(--sell-d)", border: "1px solid rgba(255,77,106,.3)", borderRadius: 10,
          padding: "11px 15px", marginBottom: 14,
        }}>
          <span style={{ color: "var(--sell)", fontWeight: 700, fontSize: ".8rem" }}>⚠ {s.alerts.length} holding{s.alerts.length > 1 ? "s" : ""} flashing SELL</span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {s.alerts.map((a) => (
              <button key={a.ticker} onClick={() => onSelect(a.ticker)} style={{
                padding: "2px 9px", borderRadius: 5, border: "1px solid rgba(255,77,106,.3)",
                background: "transparent", color: "var(--sell)", fontWeight: 700, fontSize: ".72rem", cursor: "pointer",
              }}>{a.ticker}</button>
            ))}
          </span>
        </div>
      )}

      {/* Add position */}
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap",
        background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
        padding: "14px 16px", marginBottom: 16,
      }}>
        <Field label="Symbol">
          <select value={ticker} onChange={(e) => setTicker(e.target.value)} style={inputStyle}>
            {TICKERS.map((t) => <option key={t} value={t}>{t} · {COMPANY[t]}</option>)}
          </select>
        </Field>
        <Field label="Shares">
          <input value={shares} onChange={(e) => setShares(e.target.value)} type="number" min="0" step="any" placeholder="0" style={{ ...inputStyle, width: 110 }} />
        </Field>
        <Field label="Cost basis / share">
          <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min="0" step="any" placeholder="0.00" style={{ ...inputStyle, width: 130 }} />
        </Field>
        <button onClick={submit} disabled={busy} style={{
          padding: "9px 20px", border: "none", borderRadius: 8, background: "var(--buy)", color: "#06231b",
          fontFamily: "var(--sans)", fontSize: ".8rem", fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
        }}>{busy ? "Saving…" : "Add / Update"}</button>
        {formErr && <span style={{ color: "var(--sell)", fontSize: ".72rem" }}>{formErr}</span>}
      </div>

      {/* Holdings */}
      {error ? (
        <Empty text="Cannot reach server." />
      ) : loading && !data ? (
        <Empty text="Loading portfolio…" />
      ) : positions.length === 0 ? (
        <Empty text="No positions yet. Add one above to see live P&L and signals." />
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surf)", overflowX: "auto" }}>
          <div style={{ minWidth: 720 }}>
            <Row header cells={["Symbol", "Shares", "Cost", "Price", "Mkt Value", "P&L", "Signal", ""]} />
            {positions.map((p, i) => (
              <div key={p.ticker} className="fade-up" style={{ borderTop: "1px solid var(--border)", animationDelay: `${Math.min(i * 25, 300)}ms` }}>
                <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", cursor: "pointer" }}
                  onClick={() => onSelect(p.ticker)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <Cell w="18%" left>
                    <div style={{ fontWeight: 700 }}>{p.ticker}</div>
                    <div style={{ fontSize: ".62rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{COMPANY[p.ticker] ?? ""}</div>
                  </Cell>
                  <Cell w="11%">{p.shares}</Cell>
                  <Cell w="13%">{f$(p.costBasis)}</Cell>
                  <Cell w="13%">{f$(p.price)}</Cell>
                  <Cell w="15%">{f$(p.marketValue)}</Cell>
                  <Cell w="16%">
                    <span style={{ color: plColor(p.pl), fontWeight: 600 }}>
                      {p.pl == null ? "—" : `${p.pl >= 0 ? "+" : ""}${f$(p.pl)}`}
                    </span>
                    {p.plPct != null && <span style={{ color: plColor(p.pl), fontSize: ".66rem", marginLeft: 6 }}>({p.plPct >= 0 ? "+" : ""}{p.plPct}%)</span>}
                  </Cell>
                  <Cell w="10%">
                    {p.signal ? <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: ".62rem", fontWeight: 700, background: sigDim(p.signal), color: sigColor(p.signal) }}>{p.signal}</span> : "—"}
                  </Cell>
                  <Cell w="4%" right>
                    <button title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(p.ticker); }} style={{
                      background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: ".9rem", padding: 4,
                    }}>✕</button>
                  </Cell>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: ".64rem", color: "var(--muted)", fontStyle: "italic" }}>
        Informational only — Trendline surfaces algorithmic signals, not personalized financial advice.
      </div>
    </div>
  );
}

const inputStyle = {
  background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 8, outline: "none",
  padding: "9px 11px", fontFamily: "var(--sans)", fontSize: ".8rem", color: "var(--text)",
};

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)" }}>{label}</span>
      {children}
    </div>
  );
}
function Label({ children }) {
  return <span style={{ fontSize: ".58rem", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)", fontWeight: 600 }}>{children}</span>;
}
function SumTile({ label, value, color, sub, subColor }) {
  return (
    <div className="fade-up" style={{ background: "linear-gradient(180deg, var(--surf), rgba(15,22,40,.6))", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "13px 16px" }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 7 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: "1.5rem", fontWeight: 700, color: color ?? "var(--text)" }}>{value}</span>
        {sub && <span style={{ fontFamily: "var(--mono)", fontSize: ".8rem", fontWeight: 600, color: subColor ?? "var(--dim)" }}>{sub}</span>}
      </div>
    </div>
  );
}
function Row({ header, cells }) {
  const w = ["18%", "11%", "13%", "13%", "15%", "16%", "10%", "4%"];
  const align = ["left", "right", "right", "right", "right", "right", "right", "right"];
  return (
    <div style={{ display: "flex", padding: "11px 16px", background: "var(--surf2)" }}>
      {cells.map((c, i) => (
        <div key={i} style={{ width: w[i], textAlign: align[i], fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", fontWeight: 700 }}>{c}</div>
      ))}
    </div>
  );
}
function Cell({ w, left, right, children }) {
  return <div style={{ width: w, textAlign: left ? "left" : right ? "right" : "right", fontFamily: left ? "var(--sans)" : "var(--mono)", fontSize: ".82rem" }}>{children}</div>;
}
function Empty({ text }) {
  return <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--muted)", fontSize: ".85rem" }}>{text}</div>;
}
