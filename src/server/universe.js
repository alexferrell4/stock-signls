// ─── Ticker Universe ────────────────────────────────────────────
// Single source of truth for the symbols Trendline tracks. Both the
// signal pipeline and the search endpoint read from here.

export const UNIVERSE = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  TSLA: "Tesla Inc.",
  GOOGL: "Alphabet Inc.",
  AMZN: "Amazon.com Inc.",
  META: "Meta Platforms Inc.",
  NVDA: "NVIDIA Corp.",
  AMD: "Advanced Micro Devices",
  NFLX: "Netflix Inc.",
  COIN: "Coinbase Global",
  PLTR: "Palantir Technologies",
  SOFI: "SoFi Technologies",
  RIVN: "Rivian Automotive",
  SMCI: "Super Micro Computer",
  MSTR: "MicroStrategy Inc.",
  JPM: "JPMorgan Chase",
  V: "Visa Inc.",
  WMT: "Walmart Inc.",
  DIS: "Walt Disney Co.",
  BA: "Boeing Co.",
  XOM: "Exxon Mobil",
  INTC: "Intel Corp.",
  CRM: "Salesforce Inc.",
  ORCL: "Oracle Corp.",
  ADBE: "Adobe Inc.",
  UBER: "Uber Technologies",
  PYPL: "PayPal Holdings",
  SHOP: "Shopify Inc.",
  QCOM: "Qualcomm Inc.",
  BABA: "Alibaba Group",
};

export const TICKERS = Object.keys(UNIVERSE);

// Signal timeframes. Daily = today vs prev close; weekly ≈ 5 trading days;
// monthly ≈ 21 trading days. Each gets its own momentum-driven signal.
export const TIMEFRAMES = ["daily", "weekly", "monthly"];

export function companyName(ticker) {
  return UNIVERSE[ticker] ?? ticker;
}
