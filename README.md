# Trendline — AI Stock Signals

Buy / hold / sell signals for a universe of stocks, scored from momentum,
sentiment, volume, and news — with a Claude-powered per-stock chat and a
portfolio-level advisor.

## Stack
- **Frontend:** React 18 + Vite
- **Backend:** Express (`server.js` + `src/server/*`)
- **Data:** pluggable provider — **mock** (default) or **live** (Finnhub + NewsAPI)
- **AI:** pluggable — **mock** (default) or **live** (Claude Sonnet)

## Run it (no keys needed)

```bash
npm install
npm start
```

`npm start` runs the Express backend (port 3000) and the Vite dev server
(port **5280**) together. Open **http://localhost:5280**.

> Trendline uses a dedicated port (5280) so it never shares a `localhost`
> origin with other local apps. If you ever see "Connecting to the Trendline
> API…", the backend (port 3000) isn't up yet — it will connect automatically
> once `node server.js` is running.

By default everything runs in **mock mode**: realistic synthetic prices,
news, signals, chat, and advisor — **no API keys, no credits spent**. The
board self-populates on boot and refreshes every few minutes.

## Testing (never spends credits)

```bash
npm test
```

The `node:test` suite runs entirely in mock mode — it exercises the signal
engine, the mock provider, the full refresh pipeline, and every HTTP route
(including the advisor) without touching Finnhub, NewsAPI, or Claude.

## Going live (real market data)

Add keys to `.env`:

```
FINNHUB_KEY=...      # finnhub.io/dashboard
NEWS_API_KEY=...     # newsapi.org (optional headline fallback)
CLAUDE_API_KEY=...   # console.anthropic.com/settings/keys
```

Then start with the live flags:

```bash
DATA_MODE=live AI_MODE=live npm run server   # backend
npm run dev                                  # frontend
```

- `DATA_MODE=live` uses Finnhub quotes + company news (NewsAPI fallback).
  The scheduler is US-market-hours aware so it won't burn calls overnight.
- `AI_MODE=live` uses Claude for stock analysis, chat, and the advisor.
- Leave either unset (or `mock`) to keep that layer free. You can run
  live data with mock AI, or vice-versa.

## API

| Method | Route | Purpose |
|---|---|---|
| GET  | `/api/health` | status + active modes |
| GET  | `/api/meta` | universe + refresh interval |
| GET  | `/api/search?q=` | symbol / company search |
| GET  | `/api/stocks` | all signals, best score first |
| GET  | `/api/stocks/:ticker` | one stock + news + score history |
| POST | `/api/refresh` | trigger a refresh |
| POST | `/api/chat/:ticker` | ask about one stock |
| POST | `/api/advisor` | "what should I buy / hold / sell?" over the board |

## The signal model

Score in [0,1] from four normalized components (`src/server/signal.js`):

- **Momentum 40%** — clamped intraday % change
- **Sentiment 30%** — analyst sentiment score
- **Volume spike 20%** — current vs average volume
- **News impact 10%** — lexicon-scored headlines

`≥ 0.65 → BUY`, `≥ 0.45 → HOLD`, else `SELL`. Each signal ships with a
plain-language `reason` and per-component point contributions.

> **Not financial advice.** Trendline surfaces algorithmic signals for
> informational purposes only. It does not know your personal finances,
> risk tolerance, or goals.

## Build for production

```bash
npm run build   # → dist/
npm run server  # Express serves dist/ and the API
```
