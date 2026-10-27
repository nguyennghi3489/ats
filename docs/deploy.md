# Production deploy and backups

How the app runs on the production Droplet (decisions §14, roadmap step 17): one DigitalOcean Droplet
(SGP1, 4 vCPU / 8 GB) running `docker-compose.prod.yml` from `/opt/ats`.

## What runs

| Service         | Image                                              | Memory limit | Reachable from          |
| --------------- | -------------------------------------------------- | ------------ | ----------------------- |
| `caddy`         | `caddy:2.11-alpine`                                | 128 MiB      | the internet, 80 / 443  |
| `web`           | `ghcr.io/nguyennghi3489/ats-web:${IMAGE_TAG}`      | 64 MiB       | Compose network only    |
| `api`           | `ghcr.io/nguyennghi3489/ats-api:${IMAGE_TAG}`      | 512 MiB      | Compose network only    |
| `worker`        | same API image, `node dist/main.worker.js`         | 512 MiB      | Compose network only    |
| `postgres`      | `postgres:18-alpine`                               | 2 GiB        | Compose network only    |
| `redis`         | `redis:8-alpine`                                   | 256 MiB      | Compose network only    |
| `versitygw`     | `versity/versitygw:v1.9.0` (S3 API, posix backend) | 256 MiB      | Compose network only    |
| `docling-serve` | `ghcr.io/docling-project/docling-serve-cpu:v1.37.0` | 3 GiB        | Compose network only    |
| `pg-backup`     | `prodrigestivill/postgres-backup-local:18-alpine`  | 128 MiB      | Compose network only    |

The limits total about 6.8 GiB, leaving the rest of the 8 GB for the OS and Docker.

Caddy gets a Let's Encrypt certificate for `DOMAIN` and routes:

- `https://DOMAIN/api/*` to `api:3000`, with `/api` stripped (`/api/health` reaches the API's `/health`);
- everything else to `web:8080` (the static build; unknown paths return `index.html`);
- `http://` redirects to `https://`.

Data lives on named volumes, so `docker compose down` and `up -d` keep it. Compose names them with the
project name `ats-prod`:

| Volume                    | Contents                                 |
| ------------------------- | ---------------------------------------- |
| `ats-prod_postgres-data`  | the database                             |
| `ats-prod_versitygw-data` | uploaded files (one directory per bucket) |
| `ats-prod_redis-data`     | queued jobs (append-only file)           |
| `ats-prod_caddy-data`     | TLS certificates and keys                |
| `ats-prod_caddy-config`   | Caddy's runtime config                   |
| `ats-prod_backups`        | nightly `pg_dump` files                  |

Never run `docker compose down -v` in production: it deletes every volume, backups included.

## First-time Droplet setup

As root on a fresh Ubuntu LTS Droplet:

1. Install Docker Engine with the Compose plugin
   (<https://docs.docker.com/engine/install/ubuntu/>), then check `docker compose version` (v2).
2. Create the deploy user and give it Docker:

   ```sh
   adduser --disabled-password --gecos '' deploy
   usermod -aG docker deploy
   mkdir -p /opt/ats && chown deploy:deploy /opt/ats
   ```

   Add the deploy SSH public key to `/home/deploy/.ssh/authorized_keys`. Membership of the `docker`
   group is root-equivalent; keep this user for deploys only.

3. Firewall: allow only 22, 80 and 443 (DigitalOcean Cloud Firewall, or `ufw allow OpenSSH`,
   `ufw allow 80,443/tcp`, `ufw allow 443/udp`, `ufw enable`). Only Caddy publishes ports, so nothing
   else is exposed even though Docker bypasses `ufw` for published ports.
4. Point the domain's DNS `A` record at the Droplet's IP before the first start, so Caddy can get a
   certificate.

As `deploy`, put the app in `/opt/ats`. It needs `docker-compose.prod.yml`, the `deploy/` directory and
`.env`; the simplest way is a checkout of this repository:

```sh
git clone https://github.com/nguyennghi3489/ats.git /opt/ats
cd /opt/ats
cp .env.prod.example .env
chmod 600 .env
```

Edit `.env` and replace every placeholder. Each variable has a one-line comment. Generate secrets with
`openssl rand -hex 32`. Hex values are URL-safe, which matters for `POSTGRES_PASSWORD` because it is
embedded in `DATABASE_URL`. `.env` is git-ignored, so never copy it into the repository.

If the GHCR images are private, log in once with a GitHub token that has `read:packages`:

```sh
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

## Start, update, stop

From `/opt/ats` (Compose reads `.env` from there automatically):

```sh
docker compose -f docker-compose.prod.yml config --quiet   # fails and names any missing variable
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --wait      # start; waits until everything is healthy
./deploy/smoke-test.sh                                      # HTTPS, /api/health, ports, a test backup
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api worker
```

To deploy a new version, set `IMAGE_TAG` in `.env` (or `IMAGE_TAG=<tag>` in front of the command), then
run `pull` and `up -d --wait` again. Only the changed containers restart. `docker compose -f
docker-compose.prod.yml down` stops everything and keeps the data.

`./deploy/check-config.sh` checks the Compose file itself without starting anything: services, memory
limits, published ports, volumes, health checks, backup retention, and that `.env.prod.example` lists
every variable. Run it after editing `docker-compose.prod.yml`.

### Trying the stack on a laptop

Build the images under the names the file expects and use `localhost` as the domain. Caddy then signs
with its own local CA, so `curl -k` or a browser warning is expected:

```sh
docker build -f apps/api/Dockerfile -t ghcr.io/nguyennghi3489/ats-api:local .
docker build -f apps/web/Dockerfile -t ghcr.io/nguyennghi3489/ats-web:local .
sed -e 's/^DOMAIN=.*/DOMAIN=localhost/' -e 's/^IMAGE_TAG=.*/IMAGE_TAG=local/' .env.prod.example > .env.prod.local
docker compose -f docker-compose.prod.yml --env-file .env.prod.local up -d --wait
./deploy/smoke-test.sh .env.prod.local
docker compose -f docker-compose.prod.yml --env-file .env.prod.local down -v   # local test only
```

Ports 80 and 443 must be free. The project name `ats-prod` keeps it apart from the development stack.

## Backups

There are two layers (decisions §14):

1. **Nightly `pg_dump`** (`pg-backup` service) for a quick undo. At `BACKUP_SCHEDULE` (default 03:00
   `Asia/Ho_Chi_Minh`) it writes a gzipped plain-SQL dump of `POSTGRES_DB` to the `ats-prod_backups`
   volume:

   ```text
   /backups/last/ats-YYYYMMDD-HHMMSS.sql.gz   every run, kept 24 hours
   /backups/daily/ats-YYYYMMDD.sql.gz         kept 14 days
   /backups/weekly/ats-YYYYWW.sql.gz          kept 8 weeks
   /backups/monthly/ats-YYYYMM.sql.gz         current month only (monthly copies are the Droplet Backups' job)
   /backups/*/ats-latest.sql.gz               symlink to the newest file in each folder
   ```

   The dump files sit on the same disk as the database, so they protect against mistakes, not against
   losing the Droplet.

2. **DigitalOcean Droplet Backups**: the off-machine copy of the whole disk (database, uploaded files,
   dumps). Turned on by the owner (see the checklist below).

Useful commands (from `/opt/ats`):

```sh
# Take a backup now (also a quick check that backups work)
docker compose -f docker-compose.prod.yml exec pg-backup /backup.sh

# List the dumps
docker compose -f docker-compose.prod.yml exec pg-backup ls -lR /backups

# Copy one off the server, e.g. before a risky change
docker compose -f docker-compose.prod.yml cp pg-backup:/backups/daily/ats-20261019.sql.gz .
```

Uploaded files (`ats-prod_versitygw-data`) are covered by Droplet Backups only.

## Restore a dump

This replaces the database with the contents of a dump. Everything written after the dump was taken is
lost, so copy the current state first (`exec pg-backup /backup.sh`, then `cp` the newest
`/backups/last/` file somewhere safe).

From `/opt/ats`, with the values from `.env`:

```sh
set -a; . ./.env; set +a
compose() { docker compose -f docker-compose.prod.yml "$@"; }
dump=/backups/daily/ats-20261019.sql.gz   # or /backups/daily/ats-latest.sql.gz

# 1. Stop everything that writes to the database.
compose stop api worker pg-backup

# 2. Start from an empty database.
compose exec -T postgres dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB"
compose exec -T postgres createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"

# 3. Load the dump. It stops at the first error.
compose run --rm --no-deps -T --entrypoint gunzip pg-backup -c "$dump" |
  compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -o /dev/null

# 4. Start the app again and check it.
compose up -d --wait
./deploy/smoke-test.sh
```

If the database volume itself is lost, run `compose up -d --wait postgres` first. That creates an
empty database with `unaccent` from `deploy/postgres/init/`. Then skip step 2 and run steps 1, 3 and 4.
For a dump copied in from elsewhere, pipe it from the host instead:
`gunzip -c ats-20261019.sql.gz | compose exec -T postgres psql ...`

## Owner checklist (DigitalOcean, not in this repository)

- [ ] **Enable Droplet Backups** on the production Droplet (daily if the plan offers it, otherwise
      weekly), in Droplet → Backups.
- [ ] **Disk alert at 80%**: Monitoring → Create alert policy → Disk utilization > 80% for 5 minutes on
      the Droplet, notifying the owner's email.
- [ ] **Restore test before go-live**: restore last night's dump into a scratch database or a test
      Droplet created from a Droplet Backup, following [Restore a dump](#restore-a-dump), and check the
      app works on it.
- [ ] **Repeat the restore test monthly** and note the date and result.
- [ ] Keep `/opt/ats/.env` readable by `deploy` only (`chmod 600`), and keep a copy of its secrets in
      the team's password manager. Without them the backups cannot be used.
