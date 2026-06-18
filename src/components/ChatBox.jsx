import { useState, useRef, useEffect } from "react";
import { sendChatMessage } from "../lib/api";

export default function ChatBox({ ticker }) {
  const [messages, setMessages] = useState([
    { role: "system", content: `Ask anything about ${ticker} — Claude has the live data.` },
  ]);
  const [input, setInput]     = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef             = useRef(null);
  const historyRef            = useRef([]); // tracks API-format history

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);

    setMessages(prev => [...prev, { role: "user", content: msg }]);

    try {
      const data = await sendChatMessage(ticker, msg, historyRef.current);
      const reply = data.reply || data.error || "No response.";
      historyRef.current = [...historyRef.current, { role: "user", content: msg }, { role: "assistant", content: reply }];
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error reaching server." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, overflow: "hidden" }}>
      {/* Messages */}
      <div style={{ height: 200, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => {
          if (m.role === "system") return (
            <div key={i} style={{ textAlign: "center", color: "var(--muted)", fontSize: ".7rem", fontStyle: "italic" }}>
              {m.content}
            </div>
          );
          const isUser = m.role === "user";
          return (
            <div key={i} style={{
              alignSelf: isUser ? "flex-end" : "flex-start",
              maxWidth: "88%", padding: "8px 11px", borderRadius: 8,
              fontSize: ".78rem", lineHeight: 1.5,
              background: isUser ? "var(--blue-d)" : "var(--ai-d)",
              border: `1px solid ${isUser ? "rgba(79,142,247,.2)" : "rgba(167,139,250,.15)"}`,
              color: isUser ? "var(--text)" : "var(--dim)",
            }}>
              {m.content}
            </div>
          );
        })}
        {sending && (
          <div style={{
            alignSelf: "flex-start", maxWidth: "88%", padding: "8px 11px",
            borderRadius: 8, fontSize: ".78rem", color: "var(--muted)",
            background: "var(--ai-d)", border: "1px solid rgba(167,139,250,.15)",
          }}>
            Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", borderTop: "1px solid var(--border)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder={`Why is ${ticker} showing this signal?`}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            padding: "12px 14px", fontFamily: "var(--sans)", fontSize: ".8rem",
            color: "var(--text)",
          }}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          style={{
            padding: "10px 16px", border: "none",
            borderLeft: "1px solid var(--border)",
            background: "transparent", color: "var(--ai)",
            fontFamily: "var(--sans)", fontSize: ".78rem", fontWeight: 600,
            cursor: sending || !input.trim() ? "default" : "pointer",
            opacity: sending || !input.trim() ? 0.4 : 1,
            transition: "background .15s",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
