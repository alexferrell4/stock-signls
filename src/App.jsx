import { useState, useMemo } from "react";
import Navbar, { COMPANY } from "./components/Navbar";
import MarketPulse from "./components/MarketPulse";
import StockCard from "./components/StockCard";
import StockTable from "./components/StockTable";
import StockModal from "./components/StockModal";
import Advisor from "./components/Advisor";
import { useStocks } from "./hooks/useStocks";

const FILTERS = ["ALL", "BUY", "HOLD", "SELL"];
const FILTER_COLORS = { BUY: "var(--buy)", HOLD: "var(--hold)", SELL: "var(--sell)", ALL: "var(--text)" };
const SORTS = [
  { key: "score", label: "Score" },
  { key: "changePercent", label: "Change %" },
  { key: "price", label: "Price" },
  { key: "ticker", label: "Symbol" },
];

function SkeletonCard() {
  return (
    <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div className="skeleton" style={{ width: 60, height: 20, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: 100, height: 12 }} />
        </div>
        <div className="skeleton" style={{ width: 44, height: 22, borderRadius: 5 }} />
      </div>
      <div className="skeleton" style={{ width: 88, height: 88, borderRadius: "50%", margin: "0 auto 12px" }} />
      <div className="skeleton" style={{ width: 110, height: 24, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 70, height: 12, marginBottom: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, borderTop: "1px solid var(--border)", paddingTop: 9 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="skeleton" style={{ width: 50, height: 8 }} />
            <div className="skeleton" style={{ width: "100%", height: 3 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { stocks, loading, error, lastUpdated, nextUpdate, summary, refresh, refreshing } = useStocks();
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [view, setView] = useState("grid");
  const [selectedTicker, setSelected] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = stocks.filter((s) => (filter === "ALL" ? true : s.signal === filter));
    if (q) list = list.filter((s) => s.ticker.toLowerCase().includes(q) || (COMPANY[s.ticker] ?? "").toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      if (sortKey === "ticker") {
        return sortDir === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
      }
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [stocks, filter, query, sortKey, sortDir]);

  const onSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navbar nextUpdate={nextUpdate} onRefresh={refresh} refreshing={refreshing} />
      <MarketPulse summary={summary} stocks={stocks} lastUpdated={lastUpdated} />
      <Advisor />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 28px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ fontSize: ".85rem", color: "var(--text)", fontWeight: 600 }}>Signal Overview</h2>
          <span style={{ fontSize: ".72rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>{visible.length} shown</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: ".8rem", pointerEvents: "none" }}>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol…"
              style={{
                background: "var(--surf)", border: "1px solid var(--border2)", borderRadius: 8,
                outline: "none", padding: "7px 12px 7px 28px", width: 150,
                fontFamily: "var(--sans)", fontSize: ".76rem", color: "var(--text)",
              }}
            />
          </div>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => onSort(e.target.value === sortKey ? sortKey : e.target.value)}
            style={{
              background: "var(--surf)", border: "1px solid var(--border2)", borderRadius: 8,
              padding: "7px 10px", fontFamily: "var(--sans)", fontSize: ".76rem", color: "var(--dim)", cursor: "pointer",
            }}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
          </select>
          <button onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} title="Toggle direction"
            style={{ background: "var(--surf)", border: "1px solid var(--border2)", borderRadius: 8, padding: "7px 11px", color: "var(--dim)", cursor: "pointer", fontSize: ".78rem" }}>
            {sortDir === "asc" ? "↑" : "↓"}
          </button>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 3, background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "5px 12px", border: "none", borderRadius: 5,
                background: filter === f ? "var(--surf3)" : "transparent",
                color: filter === f ? (FILTER_COLORS[f] ?? "var(--text)") : "var(--muted)",
                fontFamily: "var(--sans)", fontSize: ".74rem", fontWeight: 600, cursor: "pointer", transition: "all .15s",
              }}>{f}</button>
            ))}
          </div>

          {/* View toggle */}
          <div style={{ display: "flex", gap: 3, background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
            {[["grid", "▦"], ["list", "☰"]].map(([v, icon]) => (
              <button key={v} onClick={() => setView(v)} title={v}
                style={{
                  padding: "5px 11px", border: "none", borderRadius: 5,
                  background: view === v ? "var(--surf3)" : "transparent",
                  color: view === v ? "var(--text)" : "var(--muted)",
                  fontSize: ".85rem", cursor: "pointer", transition: "all .15s",
                }}>{icon}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ color: "var(--sell)", fontSize: "1rem", marginBottom: 8 }}>Cannot reach server</div>
          <p style={{ fontSize: ".82rem", color: "var(--muted)" }}>Make sure the Trendline API is running on port 3000.</p>
        </div>
      ) : loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))", gap: 13, padding: "0 28px 48px" }}>
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ color: "var(--dim)", fontSize: "1rem", marginBottom: 8 }}>
            No {filter === "ALL" ? "" : filter + " "}matches{query ? ` for “${query}”` : ""}
          </div>
          <p style={{ fontSize: ".82rem", color: "var(--muted)" }}>Try clearing the search or filter.</p>
        </div>
      ) : view === "list" ? (
        <StockTable stocks={visible} onSelect={setSelected} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))", gap: 13, padding: "0 28px 48px" }}>
          {visible.map((stock, i) => (
            <div key={stock.ticker} className="fade-up" style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }}>
              <StockCard stock={stock} onClick={setSelected} />
            </div>
          ))}
        </div>
      )}

      {selectedTicker && <StockModal ticker={selectedTicker} onClose={() => setSelected(null)} />}
    </div>
  );
}
