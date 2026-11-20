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
| `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` | Create the first administrator on an empty store. Use a strong password and remove these settings after initialization. |
| `DEMO_MODE` | Set to `true` only for disposable demo instances. Leave unset for production. |

Use a single server process and one timer worker per database. The SQLite adapter commits each domain snapshot in a transaction and imports an existing `marathon_db.json` on first use. Stop all writers and back up the legacy file before migration. Keep SQLite backups using a SQLite-aware backup procedure. The in-memory domain model does not coordinate multiple application replicas.

As an administrator, create a free-entry tournament in the tournament directory. Teams register with a three-player roster and the administrator generates the bracket from tournament detail. Paid production entry requires a payment provider and verified server-side payment confirmation. Development and demo checkout can register a team with explicitly simulated payment status.

Bungie IDs are format-checked and deduplicated during registration. Ownership verification requires a Bungie authentication integration.
