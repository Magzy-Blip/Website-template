# Produce shop (React + Vite)

Local produce listing demo: sign in/up, listings, cart, checkout, orders — all in **this browser** (`localStorage` / `sessionStorage`). No payment API in the UI.

**`backend/`** is Express + SQLite via [`node:sqlite`](https://nodejs.org/api/sqlite.html). The React app **does not use that API** today (`src/order_storage.ts`, `auth_storage.ts`, etc. handle data).

## Setup

**Node 22.5+** (for `node:sqlite` if you run the API). From `my-react-app`:

```bash
npm install && cd backend && npm install && cd ..
```

Optional API env: copy `backend/.env.example` → `backend/.env`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev:client` | Shop UI only (Vite, usually `http://localhost:5173`). |
| `npm run dev` | Vite + API together. |
| `npm run build` | Typecheck + production build. |

Also: `npm run dev:server` (API only), `npm run preview`, `npm run lint`.

## Code

- **`src/app.tsx`** — routes (`/`, `/landing`, `/checkout`, …).
- **`src/landing.tsx`** — main shop UI.
- **`src/order_storage.ts`** — catalog, cart, orders, loyalty.

`src/` uses **snake_case** filenames; local imports use matching casing (and `.ts` / `.tsx` where set) for TypeScript on Windows.
