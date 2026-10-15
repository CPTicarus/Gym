# Deploying the gym app

The whole app ships as **one Docker image**, which runs as one container
with one data volume:

| Inside the container | What it does |
| --- | --- |
| **Nginx** (ports 80 / 443) | Serves the React app and public uploads; passes `/api/` and `/admin/` to Django |
| **Django** under gunicorn | The backend, **compiled to native code**: no `.py` source of the app is in the image |
| **PostgreSQL 17** | The database. Only reachable from inside the container (Unix socket, no password) |
| **Backups** | A database dump every 24 hours, into the volume |

Everything that has to survive an upgrade lives in the volume, mounted at
`/data`: the database, uploads, the generated secret key and backups. The
image itself holds nothing you'd lose by replacing it.

You build the image **on your own machine** and copy only the image to the
server. The source code never goes there, and what the server runs is
machine code, not Python you could open and read.

---

## 1. Build (on your Windows machine)

With Docker Desktop running, from the project folder:

```powershell
.\docker\build.ps1 1.0.0
```

That builds the image, runs the full test suite against the compiled
backend on Postgres (a failing test stops the build), and puts everything a
server needs in `release\gym-1.0.0\`:

```
gym-1.0.0.tar.gz     the image (gym:1.0.0 and gym:latest)
compose.yaml         how to run it
gym.env.example      its settings
DEPLOY.md            this file
```

The first build downloads base images and packages and takes several
minutes. Later builds reuse most of that. `-SkipTests` skips the test run
while you're iterating, but don't ship a build made that way.

> **Migrations:** this repo's `.gitignore` excludes the `migrations/`
> folders, but the image needs them: they're compiled in, and the build
> refuses to continue if they don't match the models. Build on the machine
> that has them, which is this one. Committing them to git is safer
> still, now that a production database depends on their exact history.

## 2. First install on the server

The server needs Docker Engine with the compose plugin. It needs no
access to Docker Hub, PyPI or npm.

```bash
# from your machine
scp -r release/gym-1.0.0 root@SERVER:/opt/gym

# on the server
cd /opt/gym
docker load -i gym-1.0.0.tar.gz
cp gym.env.example gym.env
nano gym.env          # ALLOWED_HOSTS, MEMBER_SIGNUP and the three ADMIN_ lines
docker compose up -d
docker compose logs -f   # first start takes a few seconds: wait for "Starting services"
```

Open `http://SERVER/` and log in with the admin account from `gym.env`.
Then delete `ADMIN_PASSWORD` from `gym.env`, since it isn't needed again. Change
the password in the app's Settings if it was ever written down anywhere.

No `ADMIN_` lines? Make the admin by hand instead:

```bash
docker exec -it gym manage ensure_admin --username owner --national-id 0012345678
```

## 3. HTTPS

Logins and member data should not cross the internet unencrypted. Three
ways, depending on where the certificate comes from:

**Let's Encrypt (free), with certbot on the server.** Needs a domain whose
DNS points at the server.

1. In `gym.env`, set `ALLOWED_HOSTS=gym.example.com`.
2. In `compose.yaml`, uncomment the `/var/www/acme` and `/etc/letsencrypt`
   volume lines, then `sudo mkdir -p /var/www/acme && docker compose up -d`.
3. Get the certificate. The container answers certbot's challenge from
   `/var/www/acme`:
   ```bash
   sudo certbot certonly --webroot -w /var/www/acme -d gym.example.com \
       --deploy-hook "docker exec gym nginx -s reload"
   ```
4. In `gym.env`:
   ```
   TLS_CERT=/etc/letsencrypt/live/gym.example.com/fullchain.pem
   TLS_KEY=/etc/letsencrypt/live/gym.example.com/privkey.pem
   ```
   then `docker compose up -d`. The log says `Serving https`, and port 80
   now redirects to 443.

certbot renews by itself, and the `--deploy-hook` makes Nginx pick up each
new certificate.

**A certificate from anywhere else** (bought, or a CDN's origin
certificate): put `fullchain.pem` and `privkey.pem` in `/opt/gym/certs`,
uncomment the `./certs:/certs:ro` line in `compose.yaml`, then
`docker compose up -d`.

**HTTPS handled by a CDN or proxy in front of the server:** leave the
container on plain http and tell it so in `gym.env`:

```
HTTPS=true
TRUSTED_PROXIES=<the proxy's address ranges, comma-separated>
```

Without `TRUSTED_PROXIES`, every visitor would appear to come from the
proxy's address: one shared login and sign-up allowance for everyone.

## 4. Updating

```powershell
.\docker\build.ps1 1.1.0          # on your machine; copy release\gym-1.1.0 over
```

```bash
docker exec gym backup            # on the server: a backup first, always
docker load -i gym-1.1.0.tar.gz   # gym:latest now means 1.1.0
docker compose up -d              # recreates the container; migrations run on start
```

To go back, run `GYM_VERSION=1.0.0 docker compose up -d`. That's only safe
if 1.1.0 didn't change the database; otherwise restore the backup you took
first.

## 5. Backups

| | |
| --- | --- |
| Automatic | A database dump every 24 h in `/data/backups/gym-db-*.dump`, keeping the newest 14 (`BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP`) |
| By hand | `docker exec gym backup`: database **and** all uploads, as `gym-full-*.tar.gz` |
| Restore | `docker exec gym restore /data/backups/<file>` (stops the app while it runs) |

A backup on the same disk goes down with that disk. Copy them off the
server regularly:

```bash
docker cp gym:/data/backups/gym-full-20261015-030000.tar.gz .
```

To restore a backup made elsewhere, copy it in first
(`docker cp <file> gym:/data/backups/`). Moving to a new server is just
that: install there as in step 2, then restore a full backup.

## 6. Day to day

```bash
docker compose logs -f                  # Nginx, Django, Postgres, all in one log
docker exec gym supervisorctl status    # the processes
docker exec -it gym manage shell        # Django shell, as the app's own user
docker exec -it -u gym gym psql -h /run/postgresql gym    # the database
docker exec gym cat /usr/share/gym/test-report.txt         # tests this build passed
```

## Settings

All in `gym.env`, all optional except as noted in step 2.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_HOSTS` | `*` | Domain(s)/IP the app answers on, comma-separated |
| `MEMBER_SIGNUP` | `staff` | `staff`: the front desk makes accounts. `self`: sign-up page, plans locked until paid |
| `ADMIN_USERNAME`, `ADMIN_NATIONAL_ID`, `ADMIN_PASSWORD` | | The first admin, made on start if the username doesn't exist |
| `TLS_CERT`, `TLS_KEY` | `/certs/fullchain.pem`, `/certs/privkey.pem` | Certificate files. When present, https turns on |
| `HTTPS` | on with a certificate | Say `true` when https ends at a proxy in front |
| `TRUSTED_PROXIES` | | Address ranges of that proxy |
| `SECRET_KEY` | generated | Kept in `/data/secret_key` when not set |
| `WEB_CONCURRENCY` | `3` | gunicorn workers, about 70 MB each |
| `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP` | `24`, `14` | Automatic database dumps; `0` hours turns them off |
| `MEDIA_MAX_*_MB`, `MEMBER_PASSWORD_MIN_LENGTH`, `*_THROTTLE_RATE` | as in `.env.example` | Same meaning as in development |

Nginx's upload limit follows the largest `MEDIA_MAX_*_MB` by itself.

## What "compiled" protects, and what it doesn't

- **The backend is protected.** Every module in `apps/` and `gym_backend/`
  is a native extension (`.so`), stripped, with docstrings left out. The
  image has no `.py` and no `.pyc` of the app. Someone with the image can
  still see class and field names (Python needs them at run time), but
  not the code.
- **Django, DRF and the other libraries are stock open source.** There's
  nothing to protect there, so they stay as they are.
- **The frontend can't be hidden.** It's JavaScript the browser runs. It's
  minified, with no source maps shipped, which is as far as any web app
  can go.
- **Compiling isn't licensing.** Whoever has the image can run copies of
  it. Stopping that takes a licence check, which would be a separate
  feature.

## For development

Nothing changes: `runserver` with SQLite and `npm run dev` work as before.
The container's settings are in `gym_backend/settings/container.py`; the
files the image is built from are in `docker/` and the `Dockerfile`.
