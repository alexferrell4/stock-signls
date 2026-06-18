# Stock Signals — React/Vite + Express

## Stack
- **Frontend:** React 18 + Vite
- **Backend:** Express (server.js)
- **Data:** Finnhub (prices + sentiment) + NewsAPI (headlines)
- **AI:** Claude Sonnet (analysis + chat)

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Add your API keys to server.js
Open `server.js` and fill in:
```js
const CONFIG = {
  FINNHUB_KEY:   "your_key",   // finnhub.io/dashboard
  NEWS_API_KEY:  "your_key",   // newsapi.org
  CLAUDE_API_KEY:"your_key",   // console.anthropic.com/settings/keys
};
```

### 3. Run everything
```bash
npm start
```
This starts both the Express backend (port 3000) and the Vite dev server (port 5173) at the same time.

Open **http://localhost:5173** in your browser.

---

## Running separately (optional)
```bash
# Terminal 1 — backend
node server.js

# Terminal 2 — frontend
npm run dev
```

## Build for production
```bash
npm run build
```
Outputs to `dist/` — deploy anywhere static (Vercel, Netlify, etc.) with the Express backend hosted separately.
