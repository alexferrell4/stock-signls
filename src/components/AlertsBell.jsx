import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAlerts, markAlertsRead } from "../lib/api";

const sevColor = (s) => (s === "high" ? "var(--sell)" : s === "good" ? "var(--buy)" : "var(--dim)");
const sevBg = (s) => (s === "high" ? "var(--sell-d)" : s === "good" ? "var(--buy-d)" : "var(--surf2)");

function ago(ts) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// Navbar bell: unread count badge + dropdown of recent signal-transition
// alerts. Opening the panel marks everything read.
const canNotify = () => typeof Notification !== "undefined";

export default function AlertsBell({ onSelect }) {
  const [data, setData] = useState({ alerts: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useState(canNotify() && Notification.permission === "granted");
  const ref = useRef(null);
  const seen = useRef(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await fetchAlerts();
      const alerts = d.alerts ?? [];
      // Fire a desktop notification for genuinely new, high-priority alerts
      // (held positions or downgrades). Skip the very first load (all "new").
      if (!firstLoad.current && notify && canNotify() && Notification.permission === "granted") {
        alerts
          .filter((a) => !seen.current.has(a.id) && (a.severity === "high" || a.held))
          .slice(0, 3)
          .forEach((a) => { try { new Notification("Trendline signal", { body: a.message }); } catch { /* ignore */ } });
      }
      alerts.forEach((a) => seen.current.add(a.id));
      firstLoad.current = false;
      setData(d);
    } catch { /* server may be down */ }
  }, [notify]);

  const toggleNotify = async () => {
    if (!canNotify()) return;
    if (Notification.permission === "granted") { setNotify((n) => !n); return; }
    const p = await Notification.requestPermission();
    setNotify(p === "granted");
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      try { setData(await markAlertsRead()); } catch { /* ignore */ }
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={toggle} title="Alerts" style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        width: 34, height: 34, borderRadius: 8, cursor: "pointer",
        background: open ? "var(--surf2)" : "transparent", border: "1px solid var(--border2)",
        color: data.unread > 0 ? "var(--text)" : "var(--dim)",
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {data.unread > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, padding: "0 4px",
            borderRadius: 8, background: "var(--sell)", color: "#fff", fontSize: ".6rem", fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--sans)",
          }}>{data.unread > 9 ? "9+" : data.unread}</span>
        )}
      </button>

      {open && (
        <div className="fade-in" style={{
          position: "absolute", top: 42, right: 0, width: 320, maxHeight: 420, overflowY: "auto",
          background: "var(--surf)", border: "1px solid var(--border2)", borderRadius: 12,
          boxShadow: "var(--shadow-lg)", zIndex: 300,
        }}>
          <div style={{ padding: "12px 15px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--dim)" }}>Alerts</span>
            {canNotify() && (
              <button onClick={toggleNotify} title="Desktop notifications for held/SELL alerts" style={{
                display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 6,
                border: `1px solid ${notify ? "var(--buy)" : "var(--border2)"}`,
                background: notify ? "var(--buy-d)" : "transparent",
                color: notify ? "var(--buy)" : "var(--muted)", cursor: "pointer",
                fontFamily: "var(--sans)", fontSize: ".62rem", fontWeight: 600,
              }}>
                {notify ? "🔔 On" : "🔕 Notify"}
              </button>
            )}
          </div>

          {data.alerts.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--muted)", fontSize: ".78rem" }}>
              No alerts yet. You’ll be notified when a signal changes — especially for stocks you own.
            </div>
          ) : (
            data.alerts.map((a) => (
              <div key={a.id} onClick={() => { onSelect?.(a.ticker); setOpen(false); }} style={{
                padding: "11px 15px", borderBottom: "1px solid var(--border)", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span style={{ marginTop: 3, width: 7, height: 7, borderRadius: "50%", background: sevColor(a.severity), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: ".78rem", color: "var(--text)", lineHeight: 1.4 }}>{a.message}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
                    <span style={{ fontSize: ".6rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>{ago(a.ts)}</span>
                    {a.held && <span style={{ fontSize: ".56rem", fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: sevBg(a.severity), color: sevColor(a.severity) }}>HELD</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
