# Deploying MyStockVision

Everything below has been run end to end: image built, saved, deleted, restored
from the tarball, and brought up cold against an empty database.

---

## What to send

Three files. Nothing else — not the source, not a toolchain.

| File | Where it comes from |
|---|---|
| `mystockvision.tar` | `share/mystockvision.tar` (~56 MB) |
| `docker-compose.share.yml` | repo root |
| `.env.share.example` | repo root |

**Send `.env.share.example`, never your own `.env`.** The image contains no
secrets, no domain and no database — that is what makes it safe to pass
around, and it stays true only if the filled-in `.env` stays with you.

---

## Their side: four commands

Requires Docker with Compose v2. Nothing else.

```bash
# 1. Load the image
docker load -i mystockvision.tar

# 2. Create the config
cp .env.share.example .env

# 3. Fill in the two required values
#    MYSQL_ROOT_PASSWORD  -> openssl rand -base64 24
#    JWT_SECRET_KEY       -> openssl rand -base64 32
nano .env

# 4. Start
docker compose -f docker-compose.share.yml up -d
```

Then open `http://<server-ip>:3000`. Roughly 15–20 seconds on a cold start:
MySQL initialises, the app waits for its healthcheck, creates the nine tables,
and serves.

Confirm it is up:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"financial-forensics-frontend"}
```

`"database":"unreachable"` in that response means the app is running but MySQL
is not ready or the password is wrong — check `docker compose logs mysql`.

---

## Only two values are actually required

`MYSQL_ROOT_PASSWORD` and `JWT_SECRET_KEY`. With just those, the app runs:
live NSE/BSE prices, charts, screener, portfolio, watchlist and all twelve
calculators.

Every other key is optional and **degrades rather than breaks**:

| Missing | What happens |
|---|---|
| `FMP_API_KEY` | Falls back to NSE and Yahoo; some fundamentals and the IPO calendar go quiet |
| `NEWS_API_KEY` | Falls back to Google News RSS |
| `GEMINI_API_KEY` | Every AI feature falls back to its rule-based version |
| `SMTP_*` | Signup works, but no verification or reset email is sent |
| `ALERTS_CRON_SECRET` | Alerts only evaluate while the alerts page is open |
| `UPSTASH_REDIS_*` | Fine on one container; see scaling below |

`JWT_SECRET_KEY` is the one that must be secret and must be theirs. Anyone
holding it can mint a session for any account, so generate a fresh one per
deployment rather than reusing yours.

---

## Putting it on the internet

The compose file publishes port 3000 on all interfaces so it works immediately
after `up -d`. That is plain HTTP and fine for a private test. Before anyone
else uses it, terminate TLS in front of it:

1. Bind the app to loopback only — in `docker-compose.share.yml`:

   ```yaml
   ports:
     - "127.0.0.1:3000:3000"
   ```

2. Point a reverse proxy at `127.0.0.1:3000`. There is a working nginx server
   block at `deploy/nginx/mystockvision.conf`; change `server_name` and the
   certificate paths. Certificates via `certbot --nginx -d their-domain.com`.

3. `docker compose -f docker-compose.share.yml up -d`

The proxy must forward the client IP:

```nginx
proxy_set_header X-Real-IP        $remote_addr;
proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
```

Rate limiting keys on those headers. Without them every request looks like it
came from the proxy, and one visitor hitting a limit locks out everybody.

No rebuild is needed for a domain change. The browser calls the API on relative
paths and the server reads `INTERNAL_API_BASE` at run time, so the image is not
tied to any hostname.

---

## Price alerts

Alerts exist to tell you about a move you were not watching, which needs a
scheduled sweep. Set `ALERTS_CRON_SECRET` in `.env`, then on the host:

```cron
# every 5 min, 09:00-16:00 IST (03:30-10:30 UTC), Mon-Fri
*/5 3-10 * * 1-5 curl -fsS -X POST http://127.0.0.1:3000/api/v1/alerts/evaluate \
  -H "x-cron-secret: THE_VALUE_FROM_ENV" >/dev/null
```

Without it, alerts are evaluated only while a signed-in user has the alerts
page open — which defeats the purpose.

---

## Running it

```bash
docker compose -f docker-compose.share.yml logs -f app     # follow logs
docker compose -f docker-compose.share.yml restart app     # restart
docker compose -f docker-compose.share.yml down            # stop, keep data
docker compose -f docker-compose.share.yml down -v         # stop, DELETE data
```

`down -v` destroys the database volume: accounts, portfolios, watchlists and
alerts all go. `down` on its own is the safe one.

Back up the database:

```bash
docker exec msv-mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" financial_forensics' > backup.sql
```

---

## Shipping an update

```bash
# you
docker build -t mystockvision:latest ./frontend
docker save mystockvision:latest -o mystockvision.tar

# them
docker load -i mystockvision.tar
docker compose -f docker-compose.share.yml up -d
```

The schema bootstrap is idempotent (`CREATE TABLE IF NOT EXISTS`), so it is
safe on every boot and existing data is untouched.

For anything more than occasional handoffs, push to a registry instead and set
`APP_IMAGE` in `.env` to the registry path — then updating is `docker compose
pull && docker compose up -d`.

---

## Scaling past one container

The rate limiter keeps counters in memory per process. Two containers means two
independent sets of counters, so a caller gets twice the intended limit through.
Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (free tier is
plenty) and the limiter switches to shared Redis counters automatically.

---

## Troubleshooting

**Container restarts in a loop.** `docker compose logs app`. Almost always a
missing `JWT_SECRET_KEY` or an empty `MYSQL_ROOT_PASSWORD`.

**`/api/health` says `database: unreachable`.** MySQL is still starting (wait
30s) or the password changed after the volume was created. MySQL only reads
`MYSQL_ROOT_PASSWORD` when it initialises an empty volume; changing it later
has no effect. To genuinely reset: `down -v`, then `up -d` — this deletes all
data.

**Port 3000 already taken.** Set `APP_PORT=8080` in `.env` and `up -d` again.

**A stock page shows no data.** Some symbols are renamed or delisted upstream
(Zomato became Eternal, so `/stocks/ZOMATO` has no quote). Try the current
ticker. Live market data also needs outbound internet from the server.
