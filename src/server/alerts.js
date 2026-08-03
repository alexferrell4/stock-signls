// ─── Alerting (Phase 4) ─────────────────────────────────────────
// Detects signal transitions between refresh cycles and turns them into
// alerts, prioritizing positions the user actually holds. Pure detection
// (no I/O) so it's unit-testable; persistence + delivery are separate.

function buildMessage(ticker, from, to, held) {
  if (held && to === "SELL") return `You own ${ticker} — signal flipped ${from} → SELL`;
  if (held) return `You own ${ticker} — signal changed ${from} → ${to}`;
  if (to === "SELL") return `${ticker} downgraded to SELL (was ${from})`;
  if (to === "BUY") return `${ticker} upgraded to BUY (was ${from})`;
  return `${ticker} signal changed ${from} → ${to}`;
}

const severityFor = (to, held) =>
  to === "SELL" ? "high" : to === "BUY" ? "good" : held ? "high" : "info";

// Rank so the most actionable alerts (your holdings, downgrades) surface first.
const priority = (a) => (a.held ? 0 : 2) + (a.toSignal === "SELL" ? 0 : 1);

// prevSignals: { ticker -> signal } from the last cycle
// stocks:      { ticker -> current stock } this cycle
// heldSet:     Set of tickers the user holds
export function detectAlerts(prevSignals, stocks, heldSet = new Set(), nowMs = Date.now()) {
  const ts = new Date(nowMs).toISOString();
  const alerts = [];
  for (const [ticker, s] of Object.entries(stocks)) {
    const from = prevSignals[ticker];
    const to = s.signal;
    if (!from || from === to) continue; // no prior signal, or unchanged
    const held = heldSet.has(ticker);
    alerts.push({
      ts, tsMs: nowMs, ticker,
      fromSignal: from, toSignal: to,
      held, severity: severityFor(to, held),
      message: buildMessage(ticker, from, to, held),
    });
  }
  return alerts.sort((a, b) => priority(a) - priority(b));
}

// Delivery channel. In-app is the default (the DB inbox IS the delivery, so
// this is a no-op) and needs no external auth or spend — safe in tests.
// Email/SMS are integration points that only activate when their provider
// credentials are present; without them, delivery is logged, never sent.
export function makeAlertChannel(env = process.env) {
  const mode = (env.ALERT_CHANNEL ?? "inapp").toLowerCase();

  async function deliver(alert) {
    if (mode === "inapp") return; // stored in DB by the caller; nothing to push

    if (mode === "email" && env.SENDGRID_API_KEY) {
      // Integration point: send via SendGrid to env.ALERT_EMAIL.
      // Left unwired so tests/dev never spend or require auth.
      console.log(`[alert:email→${env.ALERT_EMAIL ?? "unset"}] ${alert.message}`);
      return;
    }
    if (mode === "sms" && env.TWILIO_AUTH_TOKEN) {
      // Integration point: send via Twilio to env.ALERT_PHONE.
      console.log(`[alert:sms→${env.ALERT_PHONE ?? "unset"}] ${alert.message}`);
      return;
    }
    console.warn(`[alert:${mode}] not configured — "${alert.message}" not delivered externally`);
  }

  return { mode, deliver };
}
