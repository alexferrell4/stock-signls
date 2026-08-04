import { useState, useEffect } from "react";
import { fetchMarketNews } from "../lib/api";

function ago(ts) {
  if (!ts) return "";
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

// General market news feed (NewsAPI business headlines). Collapsible.
export default function MarketNews() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = () => fetchMarketNews().then((r) => { if (!cancel) setItems(r.items ?? []); }).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  if (!items.length) return null;

  return (
    <div style={{ padding: "8px 28px 0" }}>
      <div style={{ background: "linear-gradient(180deg, var(--surf), rgba(15,22,40,.6))", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <div onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: ".6rem", textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>◆ Market News</span>
            {!open && (
              <span style={{ fontSize: ".78rem", color: "var(--dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{items[0].title}</span>
            )}
          </div>
          <span style={{ fontSize: ".64rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>{open ? "▾" : `${items.length} ▸`}</span>
        </div>

        {open && (
          <div style={{ borderTop: "1px solid var(--border)", maxHeight: 320, overflowY: "auto" }}>
            {items.map((n, i) => (
              <div key={i} style={{ padding: "11px 16px", borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ fontSize: ".8rem", lineHeight: 1.45 }}>
                  {n.url
                    ? <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "none" }}
                        onMouseEnter={(e) => (e.target.style.color = "var(--blue)")} onMouseLeave={(e) => (e.target.style.color = "var(--text)")}>{n.title}</a>
                    : n.title}
                </div>
                <div style={{ fontSize: ".62rem", color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 3 }}>
                  {n.source}{n.publishedAt ? ` · ${ago(n.publishedAt)}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
