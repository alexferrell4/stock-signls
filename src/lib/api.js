const BASE = "/api";

export async function fetchStocks() {
  const res = await fetch(`${BASE}/stocks`);
  if (!res.ok) throw new Error("Failed to fetch stocks");
  return res.json();
}

export async function fetchStock(ticker) {
  const res = await fetch(`${BASE}/stocks/${ticker}`);
  if (!res.ok) throw new Error(`Failed to fetch ${ticker}`);
  return res.json();
}

export async function fetchChart(ticker, timeframe, { compare = false, peers = [] } = {}) {
  const q = new URLSearchParams({ tf: timeframe });
  if (compare) q.set("compare", "1");
  if (peers.length) q.set("peers", peers.join(","));
  const res = await fetch(`${BASE}/stocks/${ticker}/chart?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch chart for ${ticker}`);
  return res.json();
}

export async function triggerRefresh() {
  const res = await fetch(`${BASE}/refresh`, { method: "POST" });
  return res.json();
}

export async function fetchTrackRecord() {
  const res = await fetch(`${BASE}/track-record`);
  if (!res.ok) throw new Error("Failed to fetch track record");
  return res.json();
}

export async function fetchPortfolio() {
  const res = await fetch(`${BASE}/portfolio`);
  if (!res.ok) throw new Error("Failed to fetch portfolio");
  return res.json();
}

export async function addHolding(ticker, shares, costBasis) {
  const res = await fetch(`${BASE}/portfolio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, shares, costBasis }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to add position");
  return data;
}

export async function removeHolding(ticker) {
  const res = await fetch(`${BASE}/portfolio/${ticker}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove position");
  return res.json();
}

export async function fetchAlerts() {
  const res = await fetch(`${BASE}/alerts`);
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

export async function markAlertsRead() {
  const res = await fetch(`${BASE}/alerts/read`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to mark alerts read");
  return res.json();
}

export async function sendChatMessage(ticker, message, history) {
  const res = await fetch(`${BASE}/chat/${ticker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  return res.json();
}

// Portfolio-level advisor: "what should I buy / hold / sell?"
export async function askAdvisor(message, history) {
  const res = await fetch(`${BASE}/advisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  return res.json();
}
