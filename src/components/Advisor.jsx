import { useState, useRef, useEffect } from "react";
import { askAdvisor } from "../lib/api";

const SUGGESTIONS = [
  "What should I buy, hold, or sell?",
  "Which stocks have the strongest signals?",
  "What looks risky right now?",
];

// Portfolio-level assistant. Reasons over the whole signal board and
// explains what the model suggests — framed as informational, not advice.
export default function Advisor() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const historyRef = useRef([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    try {
      const data = await askAdvisor(msg, historyRef.current);
      const reply = data.reply || data.error || "No response.";
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: msg },
        { role: "assistant", content: reply },
      ];
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error reaching the advisor." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: "0 28px 8px" }}>
      <div style={{
        background: "linear-gradient(135deg, var(--ai-d), var(--surf))",
        border: "1px solid rgba(167,139,250,.25)", borderRadius: 12, overflow: "hidden",
      }}>
        {/* Header / toggle */}
        <button onClick={() => setOpen((o) => !o)} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 18px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              padding: "3px 8px", borderRadius: 5, background: "var(--ai-d)", color: "var(--ai)",
              fontSize: ".62rem", fontWeight: 700, letterSpacing: ".07em",
            }}>⬡ ASK TRENDLINE</span>
            <span style={{ fontSize: ".82rem", fontWeight: 600 }}>
              What should I buy, hold, or sell?
            </span>
          </span>
          <span style={{ color: "var(--muted)", fontSize: ".9rem" }}>{open ? "▾" : "▸"}</span>
        </button>

        {open && (
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {/* Messages */}
            {messages.length > 0 && (
              <div style={{ maxHeight: 320, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map((m, i) => {
                  const isUser = m.role === "user";
                  return (
                    <div key={i} style={{
                      alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "92%",
                      padding: "10px 13px", borderRadius: 9, fontSize: ".8rem", lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      background: isUser ? "var(--blue-d)" : "var(--surf2)",
                      border: `1px solid ${isUser ? "rgba(79,142,247,.2)" : "var(--border2)"}`,
                      color: isUser ? "var(--text)" : "var(--dim)",
                    }}>{m.content}</div>
                  );
                })}
                {sending && (
                  <div style={{ alignSelf: "flex-start", padding: "10px 13px", borderRadius: 9, fontSize: ".8rem", color: "var(--muted)", background: "var(--surf2)", border: "1px solid var(--border2)" }}>
                    Analyzing signals…
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}

            {/* Suggestions */}
            {messages.length === 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, padding: "14px 16px 4px" }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} style={{
                    padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border2)",
                    background: "var(--surf2)", color: "var(--dim)", fontSize: ".72rem",
                    fontFamily: "var(--sans)", cursor: "pointer",
                  }}>{s}</button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ display: "flex", padding: 12, gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask about buy / hold / sell signals…"
                style={{
                  flex: 1, background: "var(--surf2)", border: "1px solid var(--border2)",
                  borderRadius: 8, outline: "none", padding: "11px 13px",
                  fontFamily: "var(--sans)", fontSize: ".8rem", color: "var(--text)",
                }}
              />
              <button onClick={() => send()} disabled={sending || !input.trim()} style={{
                padding: "0 18px", border: "none", borderRadius: 8,
                background: "var(--ai)", color: "#0b0f1a", fontFamily: "var(--sans)",
                fontSize: ".78rem", fontWeight: 700,
                cursor: sending || !input.trim() ? "default" : "pointer",
                opacity: sending || !input.trim() ? 0.4 : 1,
              }}>Ask</button>
            </div>
            <div style={{ padding: "0 16px 12px", fontSize: ".62rem", color: "var(--muted)", fontStyle: "italic" }}>
              Informational only — Trendline surfaces algorithmic signals, not personalized financial advice.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
