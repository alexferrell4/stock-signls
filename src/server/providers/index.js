// ─── Provider Selector ──────────────────────────────────────────
// Chooses the data source from env. Defaults to the mock provider so a
// fresh checkout (and every test run) works with no keys and no spend.
// Set DATA_MODE=live + FINNHUB_KEY to hit real markets.

import { makeMockProvider } from "./mock.js";
import { makeLiveProvider } from "./live.js";

export function makeProvider(env = process.env) {
  const mode = (env.DATA_MODE ?? "mock").toLowerCase();
  if (mode === "live") {
    return makeLiveProvider({
      finnhubKey: env.FINNHUB_KEY,
      newsApiKey: env.NEWS_API_KEY,
    });
  }
  return makeMockProvider();
}
