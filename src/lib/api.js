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

export async function triggerRefresh() {
  const res = await fetch(`${BASE}/refresh`, { method: "POST" });
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
