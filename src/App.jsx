import { useState } from "react";
import Navbar from "./components/Navbar";
import StatStrip from "./components/StatStrip";
import StockCard from "./components/StockCard";
import StockModal from "./components/StockModal";
import { useStocks } from "./hooks/useStocks";

const FILTERS = ["ALL", "BUY", "HOLD", "SELL"];
const FILTER_COLORS = { BUY: "var(--buy)", HOLD: "var(--hold)", SELL: "var(--sell)", ALL: "var(--text)" };

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
        {[0,1,2,3].map(i => (
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
  const [filter, setFilter]         = useState("ALL");
  const [selectedTicker, setSelected] = useState(null);

  const filtered = filter === "ALL" ? stocks : stocks.filter(s => s.signal === filter);

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navbar nextUpdate={nextUpdate} onRefresh={refresh} refreshing={refreshing} />
      <StatStrip summary={summary} lastUpdated={lastUpdated} />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px" }}>
        <h2 style={{ fontSize: ".85rem", color: "var(--dim)", fontWeight: 500 }}>Signal Overview</h2>
        <div style={{
          display: "flex", gap: 3,
          background: "var(--surf)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 3,
        }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 13px", border: "none", borderRadius: 5,
              background: filter === f ? "var(--surf2)" : "transparent",
              color: filter === f ? (FILTER_COLORS[f] ?? "var(--text)") : "var(--muted)",
              fontFamily: "var(--sans)", fontSize: ".75rem", fontWeight: 600,
              cursor: "pointer", transition: "all .15s",
            }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))",
        gap: 13, padding: "0 28px 48px",
      }}>
        {error ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "80px 24px" }}>
            <div style={{ color: "var(--sell)", fontSize: "1rem", marginBottom: 8 }}>Cannot reach server</div>
            <p style={{ fontSize: ".82rem", color: "var(--muted)" }}>Make sure server.js is running on port 3000.</p>
          </div>
        ) : loading ? (
          Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "80px 24px" }}>
            <div style={{ color: "var(--dim)", fontSize: "1rem", marginBottom: 8 }}>
              No {filter === "ALL" ? "" : filter + " "}signals yet
            </div>
            <p style={{ fontSize: ".82rem", color: "var(--muted)" }}>
              Add your API keys to server.js and restart.
            </p>
          </div>
        ) : (
          filtered.map(stock => (
            <StockCard key={stock.ticker} stock={stock} onClick={setSelected} />
          ))
        )}
      </div>

      {/* Modal */}
      {selectedTicker && (
        <StockModal ticker={selectedTicker} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
