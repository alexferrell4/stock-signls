// ─── AI Layer (analysis · chat · advisor) ───────────────────────
// Two implementations behind one interface:
//   • mock  — deterministic, grounded in the computed numbers. NO API call,
//             so dev + tests never spend Claude credits (the default).
//   • live  — Anthropic Messages API, used only when AI_MODE=live and
//             CLAUDE_API_KEY is set.
//
// IMPORTANT (compliance): Trendline surfaces algorithmic signals for
// INFORMATIONAL purposes. It is not a licensed advisor and does not know
// the user's personal finances. Every advisor/chat response carries a
// "not personalized financial advice" disclaimer, in both modes.

const DISCLAIMER =
  "This is Trendline's algorithmic signal, for informational purposes only — not personalized financial advice. Do your own research.";

const CLAUDE_MODEL = "claude-sonnet-5";

function confidenceFromScore(score) {
  const d = Math.abs(score - 0.5);
  return d >= 0.18 ? "High" : d >= 0.08 ? "Medium" : "Low";
}

// ── Mock implementation ─────────────────────────────────────────
function mockAI() {
  async function generateAnalysis({ ticker, company, quote, signal, news }) {
    const dir = signal.signal === "BUY" ? "constructive" : signal.signal === "SELL" ? "cautious" : "neutral";
    const chg = quote.changePercent;
    const ex = signal.explanation;
    const netTxt = ex ? `, net ${ex.net >= 0 ? "+" : ""}${ex.net} vs a neutral 50` : "";
    const drivers = ex ? ex.summary : signal.reason;
    const summary =
      `${company} (${ticker}) scores ${Math.round(signal.score * 100)}/100${netTxt} — a ${signal.signal} signal. ` +
      `The model is ${dir} here, driven by ${drivers}. ` +
      `Price is ${chg >= 0 ? "up" : "down"} ${Math.abs(chg).toFixed(2)}% on the session.`;
    const keyRisk =
      signal.signal === "SELL"
        ? "Momentum and sentiment are working against it; watch for a trend reversal before any entry."
        : signal.signal === "BUY"
        ? "Signal is driven by short-term momentum and can fade quickly; size positions accordingly."
        : "Signals are mixed — no clear edge in either direction right now.";
    return { summary, confidence: confidenceFromScore(signal.score), keyRisk, disclaimer: DISCLAIMER, model: "mock" };
  }

  async function chat({ ticker, stock, message }) {
    const s = stock;
    if (!s) return { reply: `I don't have current data loaded for ${ticker}. Try refreshing.`, model: "mock" };
    const reply =
      `Here's what Trendline's model sees for ${ticker}: a ${s.signal} signal at ${Math.round(s.score * 100)}/100. ` +
      `Drivers — ${s.reason}. Component points: momentum ${s.contributions.momentum}, sentiment ${s.contributions.sentiment}, ` +
      `volume ${s.contributions.volumeSpike}, news ${s.contributions.newsImpact}. ` +
      `(You asked: "${message}".) ${DISCLAIMER}`;
    return { reply, model: "mock" };
  }

  async function advise({ stocks, message }) {
    return { reply: buildAdvisorReply(stocks, message), model: "mock" };
  }

  return { mode: "mock", generateAnalysis, chat, advise };
}

// Deterministic advisor summary over the whole board. Used verbatim in
// mock mode and as a grounded fallback if a live call fails.
function buildAdvisorReply(stocks, message) {
  const sorted = [...stocks].sort((a, b) => b.score - a.score);
  const buys = sorted.filter((s) => s.signal === "BUY");
  const sells = sorted.filter((s) => s.signal === "SELL").reverse();
  const holds = sorted.filter((s) => s.signal === "HOLD");

  const fmt = (s) => `${s.ticker} (${Math.round(s.score * 100)}/100 — ${s.reason})`;
  const lines = [];
  lines.push(`You asked: "${message}"`);
  lines.push("");
  lines.push(`Based on Trendline's current signals across ${stocks.length} tracked stocks:`);
  lines.push("");
  lines.push(buys.length ? `🟢 BUY leaning (${buys.length}): ${buys.slice(0, 5).map(fmt).join("; ")}` : "🟢 No BUY signals right now.");
  lines.push(holds.length ? `🟡 HOLD (${holds.length}): ${holds.slice(0, 5).map((s) => s.ticker).join(", ")}` : "🟡 No HOLD signals right now.");
  lines.push(sells.length ? `🔴 SELL leaning (${sells.length}): ${sells.slice(0, 5).map(fmt).join("; ")}` : "🔴 No SELL signals right now.");
  lines.push("");
  const top = buys[0];
  const bottom = sells[0];
  if (top) lines.push(`Strongest signal: ${top.ticker} at ${Math.round(top.score * 100)}/100.`);
  if (bottom) lines.push(`Weakest signal: ${bottom.ticker} at ${Math.round(bottom.score * 100)}/100.`);
  lines.push("");
  lines.push(DISCLAIMER);
  return lines.join("\n");
}

// ── Live implementation ─────────────────────────────────────────
function liveAI({ apiKey, fetchImpl = fetch }) {
  async function callClaude({ system, messages, maxTokens = 1024 }) {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "Claude API error");
    return data.content?.map((c) => c.text).join("") ?? "";
  }

  async function generateAnalysis({ ticker, company, quote, signal, news }) {
    const system =
      `You are Trendline's equity signal analyst. Be concise and factual. ` +
      `Always frame output as informational, not personalized financial advice.`;
    const headlines = news.slice(0, 5).map((n) => `- ${n.headline} (${n.source})`).join("\n");
    const breakdown = (signal.explanation?.components ?? [])
      .map((c) => `  ${c.label} (${c.weightPct}%): ${c.points} pts, ${c.delta >= 0 ? "+" : ""}${c.delta} vs neutral — ${c.detail}`)
      .join("\n");
    const prompt =
      `Stock: ${company} (${ticker})\nPrice: $${quote.price} (${quote.changePercent}% today)\n` +
      `Model signal: ${signal.signal} at ${Math.round(signal.score * 100)}/100 ` +
      `(net ${signal.explanation?.net ?? 0} vs neutral 50)\n` +
      `Score decomposition:\n${breakdown}\nRecent headlines:\n${headlines}\n\n` +
      `Explain the signal grounded ONLY in this decomposition. ` +
      `Respond as JSON: {"summary": "...", "confidence": "High|Medium|Low", "keyRisk": "..."}`;
    try {
      const text = await callClaude({ system, messages: [{ role: "user", content: prompt }], maxTokens: 512 });
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      return { ...json, disclaimer: DISCLAIMER, model: CLAUDE_MODEL };
    } catch {
      return mockAI().generateAnalysis({ ticker, company, quote, signal, news });
    }
  }

  async function chat({ ticker, stock, message, history = [] }) {
    const system =
      `You are Trendline's assistant discussing ${ticker}. Ground every claim in the provided ` +
      `signal data. Always end with a one-line reminder that this is informational, not personalized advice.`;
    const context = stock
      ? `Current data for ${ticker}: signal ${stock.signal} (${Math.round(stock.score * 100)}/100), ` +
        `drivers: ${stock.reason}, price $${stock.price} (${stock.changePercent}%).`
      : `No live data loaded for ${ticker}.`;
    try {
      const reply = await callClaude({
        system,
        messages: [...history, { role: "user", content: `${context}\n\nUser: ${message}` }],
      });
      return { reply, model: CLAUDE_MODEL };
    } catch {
      return mockAI().chat({ ticker, stock, message });
    }
  }

  async function advise({ stocks, message, history = [] }) {
    const system =
      `You are Trendline's portfolio signal advisor. You have the model's buy/hold/sell signals for a ` +
      `universe of stocks. Summarize what the signals suggest and explain the reasoning. You do NOT know the ` +
      `user's personal finances, risk tolerance, or goals — never pretend to. Always end with: "${DISCLAIMER}"`;
    const board = stocks
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((s) => `${s.ticker}: ${s.signal} ${Math.round(s.score * 100)}/100 (${s.reason})`)
      .join("\n");
    try {
      const reply = await callClaude({
        system,
        messages: [...history, { role: "user", content: `Current signals:\n${board}\n\nUser question: ${message}` }],
        maxTokens: 1024,
      });
      return { reply, model: CLAUDE_MODEL };
    } catch {
      return { reply: buildAdvisorReply(stocks, message), model: "mock-fallback" };
    }
  }

  return { mode: "live", generateAnalysis, chat, advise };
}

export function makeAI(env = process.env) {
  const mode = (env.AI_MODE ?? "mock").toLowerCase();
  if (mode === "live" && env.CLAUDE_API_KEY) {
    return liveAI({ apiKey: env.CLAUDE_API_KEY });
  }
  return mockAI();
}

export { DISCLAIMER, buildAdvisorReply };
