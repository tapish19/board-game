# Pixel War 🌍

A real-time shared grid where players around the world claim tiles simultaneously. Every click is validated server-side and broadcast live to all connected users — no refresh needed.

---

## Table of Contents

- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Deploy to production](#deploy-to-production)
  - [Step 1 — CockroachDB (database)](#step-1--cockroachdb-database)
  - [Step 2 — Render (backend)](#step-2--render-backend)
  - [Step 3 — Vercel (frontend)](#step-3--vercel-frontend)
- [Nakama admin console](#nakama-admin-console)
- [Troubleshooting](#troubleshooting)

---

## How it works

```
Browser (React + Vite)
      │
      │  WebSocket (persistent)
      ▼
Nakama :7350   ← server-authoritative match loop
      │          validates every tile claim
      │          broadcasts delta to all players
      ▼
CockroachDB    ← tile state saved every 5 s
                 survives server restarts
```

- One **global match** is created on startup. Every player joins the same match.
- The server enforces a **3-second cooldown** per player — clients cannot cheat.
- Only the **changed tile** is broadcast per claim, not the full 1 000-tile board.
- Players authenticate automatically via a **device ID** stored in `localStorage` — no sign-up needed.

---

## Project structure

```
pixel-war-game/
├── client/                        # React + Vite frontend
│   ├── src/
│   │   ├── nakama-client.ts       # Auth, RPC, WebSocket singleton
│   │   ├── useGame.ts             # Match state + socket events
│   │   ├── App.tsx                # Auth gate + page routing
│   │   ├── Lobby.tsx              # Name + color picker
│   │   ├── Game.tsx               # Game shell + header bar
│   │   ├── GameBoard.tsx          # 40 × 25 interactive grid
│   │   └── App.css                # Dark theme
│   ├── .env                       # Local env vars
│   ├── vite.config.ts
│   └── package.json
│
├── nakama/
│   ├── data/modules/index.js      # Server-authoritative game logic
│   ├── local.yml                  # Nakama server config
│   └── Dockerfile                 # Used by Render for the backend
│
├── docker-compose.yml             # Local dev stack
├── docker-compose.prod.yml        # Production overrides
└── Makefile
```

---

## Run locally

### Prerequisites

| Tool | Min version | Download |
|------|-------------|----------|
| Docker Desktop | 4.x | https://www.docker.com/products/docker-desktop |
| Node.js | 20 | https://nodejs.org |
| npm | 10 | bundled with Node.js |

---

### 1. Clone the repo

```bash
git clone https://github.com/yourorg/pixel-war-game.git
cd pixel-war-game
```

---

### 2. Start the backend (Nakama + CockroachDB)

```bash
docker compose up -d
```

This starts two containers:

| Container | Ports | What it is |
|-----------|-------|------------|
| `cockroachdb` | `26257`, `8081` | Database |
| `nakama` | `7350`, `7351` | Game server |

CockroachDB takes ~10 s to become healthy. Nakama then runs migrations and loads `index.js`. Wait until this returns `{}`:

```bash
curl http://localhost:7350/healthcheck
```

---

### 3. Configure the frontend for local dev

Open `client/.env` and make sure it looks like this:

```env
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_SSL=false
VITE_NAKAMA_KEY=defaultkey
```

> If your `.env` currently points at Render (e.g. `VITE_NAKAMA_HOST=https://board-game-85nq.onrender.com/`), change it to `127.0.0.1` for local dev. Vite bakes these values in at start time, so restart `npm run dev` after any change.

---

### 4. Start the frontend

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.  
Open a second tab to test real-time multiplayer between two players.

---

### Handy commands

```bash
# Stream Nakama logs (useful for debugging)
docker compose logs -f nakama

# Restart Nakama after editing index.js
docker compose restart nakama

# Stop everything
docker compose down

# Stop and delete all data (tiles, users, sessions)
docker compose down -v
```

---

## Environment variables

### Frontend — `client/.env`

| Variable | Description | Local value | Production value |
|----------|-------------|-------------|-----------------|
| `VITE_NAKAMA_HOST` | Nakama hostname — **bare host only, no `https://` prefix** | `127.0.0.1` | `your-app.onrender.com` |
| `VITE_NAKAMA_PORT` | Nakama port | `7350` | `443` |
| `VITE_NAKAMA_SSL` | Use WSS / HTTPS | `false` | `true` |
| `VITE_NAKAMA_KEY` | Server key (must match Nakama config) | `defaultkey` | your secret key |

> ⚠️ Vite bakes these values into the JavaScript bundle at **build time**, not runtime. Changing them requires a rebuild (`npm run build`) or a Vercel redeploy.

> ⚠️ `VITE_NAKAMA_HOST` must be a **bare hostname** — no protocol, no trailing slash. Wrong: `https://my-app.onrender.com/`. Correct: `my-app.onrender.com`.

### Backend — Nakama config (`nakama/local.yml`)

| Field | Default | Description |
|-------|---------|-------------|
| `socket.server_key` | `defaultkey` | Must match `VITE_NAKAMA_KEY` |
| `console.username` | `admin` | Admin console login |
| `console.password` | `admin1234` | Admin console password |
| `runtime.http_key` | `defaulthttpkey` | HTTP RPC key |

---

## Deploy to production

The recommended production stack is:

| Layer | Service | Cost |
|-------|---------|------|
| Database | CockroachDB Serverless | Free tier (5 GB) |
| Backend | Render (Docker) | Free tier (spins down after inactivity) |
| Frontend | Vercel | Free tier |

---

### Step 1 — CockroachDB (database)

Nakama needs a PostgreSQL-compatible database. CockroachDB Serverless has a permanent free tier.

1. Go to **https://cockroachlabs.com/free** and create an account.

2. Create a new **Serverless cluster**. Pick any region close to your Render region (e.g. `us-east-1`).

3. Once the cluster is ready, click **Connect** → **Connection string**.  
   Select **General connection string**. It looks like:
   ```
   postgresql://username:password@free-tier14.aws-us-east-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full
   ```

4. Copy this string. You will need it in the next step.  
   **Rename the database** from `defaultdb` to `nakama` in the URL:
   ```
   postgresql://username:password@free-tier14.aws-us-east-1.cockroachlabs.cloud:26257/nakama?sslmode=verify-full
   ```

---

### Step 2 — Render (backend)

Render runs the Nakama game server as a Docker container.

#### 2a. Push your code to GitHub

Render deploys from a GitHub repo.

```bash
git remote add origin https://github.com/yourname/pixel-war-game.git
git push -u origin main
```

#### 2b. Create a new Web Service on Render

1. Go to **https://render.com** → **New** → **Web Service**.
2. Connect your GitHub repo.
3. Configure the service:

   | Setting | Value |
   |---------|-------|
   | **Name** | `pixel-war-backend` (or anything) |
   | **Root Directory** | `nakama` |
   | **Dockerfile Path** | `./Dockerfile` |
   | **Instance Type** | Free |
   | **Port** | `7350` |

4. Under **Environment Variables**, add:

   | Key | Value |
   |-----|-------|
   | `DATABASE_ADDRESS` | your CockroachDB connection string from Step 1 |
   | `NAKAMA_SERVER_KEY` | a long random secret, e.g. `pixelwar-secret-2025` |

5. Click **Create Web Service**.

   Render will build the Docker image and start the server. First deploy takes ~3 minutes.

6. Once deployed, your backend URL will be something like:
   ```
   https://pixel-war-backend.onrender.com
   ```
   Test it:
   ```bash
   curl https://pixel-war-backend.onrender.com/healthcheck
   # expected: {}
   ```

#### 2c. Important — free tier sleep behaviour

Render's free tier **spins down the server after 15 minutes of inactivity**. The first request after spin-down takes ~30 seconds. If you need the server always on, upgrade to the $7/month Starter plan.

---

### Step 3 — Vercel (frontend)

#### 3a. Install the Vercel CLI

```bash
npm install -g vercel
```

#### 3b. Set production env vars in `client/.env`

Update `client/.env` with your Render backend URL:

```env
VITE_NAKAMA_HOST=pixel-war-backend.onrender.com
VITE_NAKAMA_PORT=443
VITE_NAKAMA_SSL=true
VITE_NAKAMA_KEY=pixelwar-secret-2025
```

> Use the **bare hostname** — no `https://`, no trailing slash.

#### 3c. Deploy

```bash
cd client
vercel deploy --prod
```

Follow the prompts:
- **Set up and deploy** → `Y`
- **Which scope** → your Vercel account
- **Link to existing project** → `N` (first time)
- **Project name** → `pixel-war` (or anything)
- **Directory** → `.` (current directory, i.e. `client/`)

Vercel will build and deploy. You get a URL like `https://pixel-war.vercel.app`.

#### 3d. Alternative — deploy via Vercel dashboard (no CLI)

1. Go to **https://vercel.com** → **Add New Project**.
2. Import your GitHub repo.
3. Set **Root Directory** to `client`.
4. Add environment variables:

   | Name | Value |
   |------|-------|
   | `VITE_NAKAMA_HOST` | `pixel-war-backend.onrender.com` |
   | `VITE_NAKAMA_PORT` | `443` |
   | `VITE_NAKAMA_SSL` | `true` |
   | `VITE_NAKAMA_KEY` | `pixelwar-secret-2025` |

5. Click **Deploy**.

#### 3e. Redeploying after changes

```bash
# After changing client code
cd client
vercel deploy --prod

# After changing index.js (server)
# Just push to GitHub — Render auto-deploys on push
git add nakama/data/modules/index.js
git commit -m "fix: update server logic"
git push
```

---

## Nakama admin console

| Environment | URL |
|-------------|-----|
| Local | http://localhost:7351 |
| Render | Not directly exposed on free tier — use Render shell |

**Local credentials** (from `nakama/local.yml`):
- Username: `admin`
- Password: `admin1234`

### Useful things to do in the console

**View saved tile state**  
Storage → Collection: `pixel_war` → Key: `tiles` → see the full JSON board.

**See who is online**  
Matches → click `pixel_war_global` → see connected presences.

**Reset the board**  
Storage → find the `pixel_war / tiles` record → delete it → restart Nakama.  
All tiles go back to unclaimed.

**Inspect a user**  
Users → search by username or user ID.

---

## Troubleshooting

### "Auth failed" on localhost

Nakama is still starting. Wait 15 seconds and refresh.  
Check it is ready: `curl http://localhost:7350/healthcheck` should return `{}`.

### "Failed to fetch" when clicking Join

Your `VITE_NAKAMA_HOST` is wrong. Common mistakes:

| Wrong | Correct |
|-------|---------|
| `https://my-app.onrender.com/` | `my-app.onrender.com` |
| `https://my-app.onrender.com` | `my-app.onrender.com` |
| `127.0.0.1` when targeting Render | `my-app.onrender.com` |

After fixing `.env`, restart `npm run dev` (local) or redeploy to Vercel (production).

### "Failed to join board" / "Disconnected"

The WebSocket connected but the match join failed. Most likely causes:

1. **`VITE_NAKAMA_KEY` does not match `NAKAMA_SERVER_KEY`** — both must be the same string.
2. **Render is waking up** — the free tier sleeps after inactivity. Wait 30 seconds and retry.
3. **SSL mismatch** — if your Render URL is `https://`, set `VITE_NAKAMA_SSL=true` and `VITE_NAKAMA_PORT=443`.

### Tiles not saving (Nakama logs show `saveTiles failed`)

The `value` field in `nk.storageWrite` must be a plain JS object, not a JSON string. Check `index.js` — the `saveTiles` function should pass:
```js
value: { tiles: tiles }    // ✓ plain object
// NOT:
value: JSON.stringify({ tiles: tiles })   // ✗ string — breaks storage
```

### Changes to `index.js` not taking effect locally

```bash
docker compose restart nakama
docker compose logs -f nakama   # watch for "Pixel War module loaded"
```

### CockroachDB won't connect on Render

Make sure your `DATABASE_ADDRESS` environment variable on Render is the full connection string including `?sslmode=verify-full`. CockroachDB Serverless requires SSL.

### Board resets after Render redeploy

This is expected if Nakama can't write to CockroachDB. Check the Render logs for `saveTiles failed` — it means the `DATABASE_ADDRESS` env var is missing or wrong.

---

## Quick reference

```bash
# ── Local ──────────────────────────────────────────────────
docker compose up -d            # start backend
cd client && npm run dev        # start frontend → localhost:3000
docker compose logs -f nakama   # watch server logs
docker compose restart nakama   # apply index.js changes
docker compose down -v          # wipe everything

# ── Deploy ─────────────────────────────────────────────────
# Backend: push to GitHub → Render auto-deploys
git push origin main

# Frontend: deploy to Vercel
cd client && vercel deploy --prod
```
