# WebsHub Labs v4.1 — Vercel Ready

Network intelligence dashboard with Vercel Node.js Functions.

## Deploy

1. Upload/import this folder into Vercel.
2. Framework Preset: **Other** (or let Vercel detect it).
3. Build Command: leave empty.
4. Output Directory: leave empty.
5. Deploy.

The frontend is served from `public/` and API routes are under `/api/*.js`.

## API routes

- `/api/proxies`
- `/api/test`
- `/api/dns`
- `/api/ssl`
- `/api/whois`
- `/api/portscan`
- `/api/traceroute`

Node.js `24.x` is pinned because Vercel has deprecated Node.js 20 for new deployments.
