# Marathon tournament platform

Run on Node.js 24. Install locked dependencies with Bun and start the development server on port 3000.

```sh
bun install --frozen-lockfile
export JWT_SECRET="$(node -p "require('node:crypto').randomBytes(32).toString('hex')")"
npm run dev
```

Run `npm test`, `npm run lint`, and `npm run build`. Run tests in a separate checkout or working directory from any live development server, since the tests exercise the local JSON store. Visit `/api/health` to confirm the service is responding.

## Deployment

Build with `npm run build` and run `NODE_ENV=production npm start` behind a TLS reverse proxy. Forward port 3000 and configure the proxy to stream `/api/events` without response buffering. Supply the following in the process environment.

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Stable, securely generated signing secret of at least 32 characters. |
| `MARATHON_SQLITE_PATH` | Absolute path to a SQLite file on a persistent volume. The parent directory must exist and be writable. |
| `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` | Create the first administrator on an empty store. Use a randomly generated password of at least 16 characters and at most 72 bytes and remove these settings after initialization. |
| `DEMO_MODE` | Set to `true` only for disposable demo instances. Leave unset for production. |

Use a single server process and one timer worker per database. The SQLite adapter commits each domain snapshot in a transaction and imports a legacy snapshot only when `MARATHON_IMPORT_LEGACY_JSON=true` and SQLite has no snapshot. Set `MARATHON_JSON_PATH` to the source file (default `./marathon_db.json`) and remove the import flag after migration. Stop all writers and back up the legacy file before migration. Keep SQLite backups using a SQLite-aware backup procedure. The in-memory domain model does not coordinate multiple application replicas.

As an administrator, create a free-entry tournament in the tournament directory. Teams register with a three-player roster and the administrator generates the bracket from tournament detail. Paid production entry requires a payment provider and verified server-side payment confirmation. Development and demo checkout can register a team with explicitly simulated payment status.

Bungie IDs are format-checked and deduplicated during registration. Ownership verification requires a Bungie authentication integration.

## HTTP security and account roles

Team and tournament registration captain IDs control captain permissions. Team creation writes the team and captain membership together. The legacy global `CAPTAIN` role is descriptive only. Accounts can captain one or more teams and join other teams independently.

Login allows 30 requests per 15 minutes per client IP. Registration allows 10 per 15 minutes. Both count successful and unsuccessful requests and return a generic 429 with retry information. IPv6 clients are grouped by /56. The limits use in-memory counters and reset on process restart. Behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the exact comma-separated IP addresses of trusted proxies. Restrict access to the application port and configure the proxy to sanitize and overwrite forwarded headers, preserve the public Host, and set X-Forwarded-Proto. Leave the setting empty for direct clients. Clients sharing a public IP share the limits.

Production serves the UI and API on the same origin. `ALLOWED_ORIGINS` can explicitly allow additional exact origins on the API, including scheme and port where applicable. Other browser origins receive 403. Development retains permissive CORS for local tooling. JSON and form bodies are capped at 32 KiB.

Production Helmet policy allows same-origin scripts, styles, and API/SSE connections, with inline styles for React layout and HTTPS external images. Frames are denied, MIME sniffing is disabled, and referrers are suppressed. Enable HSTS with `ENABLE_HSTS=true` only for HTTPS-only deployments. Vite development runs without production CSP. Evidence links can use HTTP or HTTPS. Uploaded image references use HTTPS. The server stores URLs without fetching them.

### Render Web Service

Use Node.js 24, one instance, and a persistent disk mounted at `/var/data`. Use
`bun install --frozen-lockfile && npm run build` to build and `npm start` to
start. Set the health check path to `/api/health`.

Set `NODE_ENV=production`, `MARATHON_SQLITE_PATH=/var/data/marathon.sqlite`,
`ENABLE_HSTS=false`, and a secure `JWT_SECRET` in Render. Render supplies
`PORT` and `RENDER=true`. The app listens on `0.0.0.0` and trusts one proxy
hop on Render. Other deployments use `TRUSTED_PROXY_IPS` when configured and
default to port 3000 when `PORT` is unset.
