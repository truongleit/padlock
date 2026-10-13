# Deploy the backend to a Contabo VPS with GitHub Actions

Flow: push a version tag (e.g. `v1.0.0`) → GitHub Actions builds a Docker image tagged with it → pushes it to GHCR → SSHes into the VPS → `docker compose pull && up -d`. Pushes to `main` do not deploy.

**Why this shape?**

- **Docker image** – the build happens once in CI, so the VPS runs exactly what was built (same Node, same dependencies). The VPS needs no Node, pnpm, or source code.
- **GHCR (GitHub Container Registry)** – a free registry next to the repo; it is the hand-off point between CI and the VPS.
- **Tags instead of `main`** – a deploy happens only when you decide to release, not on every merge. Each release is an immutable, named image (`padlock-server:v1.0.0`), which makes rollback a one-line change.
- **SSH + compose** – the simplest way to update a single VPS. No Kubernetes or orchestrator is needed at this size.

> The `Dockerfile`, `docker-compose.prod.yml`, and workflow below are **untested templates**. They are not in the repo yet; add them when you start deploying.

## Part 1: Prepare the VPS (one time)

SSH in with the IP and root password Contabo emailed you (pick Ubuntu 24.04 at install):

```bash
ssh root@<VPS_IP>

# Create a deploy user; CI should not use root
adduser deploy && usermod -aG sudo deploy

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Firewall: only SSH + web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

Why each step:

- **`deploy` user** – CI holds this user's SSH key. If the key leaks, an attacker gets a limited account instead of root.
- **Docker install script** – the official one-liner installs Docker Engine and the compose plugin. Ubuntu's own `docker.io` package lags behind.
- **`usermod -aG docker deploy`** – lets `deploy` run `docker` without `sudo`, which CI needs (it cannot type a sudo password). Note this group is effectively root-equivalent on the box, so treat the key accordingly.
- **Firewall** – a public VPS is scanned within minutes. Only SSH (22) and web (80/443) are open; Postgres (5432) and the app port (3000) stay unreachable from outside. Run `ufw allow OpenSSH` **before** `ufw enable`, or you lock yourself out.

Create a dedicated SSH key for CI (run on your machine):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/padlock_deploy -N ""
ssh-copy-id -i ~/.ssh/padlock_deploy.pub deploy@<VPS_IP>
```

- **Dedicated key, no passphrase** – CI cannot enter a passphrase, so the key is passphrase-less. That is why it is separate from your personal key: you can revoke it alone by deleting one line from `~/.ssh/authorized_keys` on the VPS.
- **`ssh-copy-id`** – installs the public half on the `deploy` user. (If `deploy` has no password login yet, run it once with the password you set in `adduser`.)
- **ed25519** – short, modern, and fast; no reason to use RSA here.

On the VPS, create the directory and the production env file:

```bash
su - deploy
mkdir -p ~/padlock && cd ~/padlock
nano .env
```

```env
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://padlock:<strong-password>@db:5432/padlock
ADMIN_JWT_SECRET=<openssl rand -base64 48>
ADMIN_JWT_EXPIRES_IN=1h
ADMIN_WEB_ORIGIN=https://<web-domain>
SMTP_HOST=          # leave empty and mails are only logged to the console
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Padlock <no-reply@yourdomain.com>"
```

- **Why the `.env` lives only on the VPS** – secrets must never be in the repo or the image. CI never sees them; it only replaces the `GHCR_OWNER` and `IMAGE_TAG` lines (see the workflow).
- **`@db:5432`** – inside the compose network the database is reachable by its service name `db`, not `localhost`.
- **The two passwords must match** – `POSTGRES_PASSWORD` creates the database user on first start; `DATABASE_URL` is what the server connects with. Postgres only applies the password when the volume is first created, so changing it later in `.env` does **not** change the real password.
- **`ADMIN_JWT_SECRET`** – `src/config/env.ts` rejects secrets shorter than 32 chars; `openssl rand -base64 48` gives a safe one. Use a different value from local dev: anyone with it can forge admin tokens.
- **`ADMIN_WEB_ORIGIN`** – must be the exact origin of the web app, since it drives the CORS allow-list and reset-password links.
- **Empty `SMTP_HOST`** – the server falls back to `ConsoleMailService`, so password-reset mails only appear in the logs. Fill in SMTP before real users need resets.

## Part 2: Add files to the repo

### `apps/server/Dockerfile` (build context is the repo root)

```dockerfile
FROM node:25-slim
RUN npm i -g pnpm@12.8.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter server...
RUN pnpm --filter server db:generate && pnpm --filter server build
WORKDIR /app/apps/server
EXPOSE 3000
# Run migrations, then start
CMD ["sh", "-c", "pnpm db:deploy && node dist/main.js"]
```

- **`node:25-slim` + pinned pnpm** – matches `.tool-versions` / `packageManager`, so CI builds with the same toolchain as local dev. `slim` is Debian-based, which `argon2` needs for its prebuilt/native binary (Alpine's musl often breaks it).
- **Build context = repo root** – pnpm workspaces need the root `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`, not only `apps/server`.
- **`--frozen-lockfile`** – fails if the lockfile is out of date, so the image uses exactly the versions you tested.
- **`--filter server...`** – installs only the server and its workspace dependencies, skipping the web app's packages.
- **`db:generate` before `build`** – the Prisma client in `src/generated/prisma` is gitignored, so it must be generated inside the image or the TypeScript build has nothing to import.
- **`WORKDIR /app/apps/server`** – so `pnpm db:deploy` and `node dist/main.js` run from the right folder.
- **Migrations in `CMD`** – every container start applies pending migrations (`prisma migrate deploy` is idempotent and safe to repeat), so a release can never run against an outdated schema. Trade-off: if you ever run several replicas, they would race to migrate; move migrations to a one-off step then.

### `.dockerignore` (root)

```
node_modules
**/node_modules
**/dist
.git
**/.env
graphify-out
```

- **`node_modules` and `dist`** – the image installs and builds its own; copying host copies would be huge and could contain macOS binaries that do not run on Linux.
- **`.git`** – large and not needed to build.
- **`**/.env`** – prevents your local secrets from being baked into an image layer (anyone who can pull the image could read them).
- **`graphify-out`** – local tooling output.

### `docker-compose.prod.yml` (root; the workflow copies it to the VPS)

```yaml
services:
  db:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_USER: padlock
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: padlock
    volumes: [pgdata:/var/lib/postgresql/data]   # do not publish port 5432
  server:
    image: ghcr.io/${GHCR_OWNER}/padlock-server:${IMAGE_TAG}   # both set in .env by the workflow
    restart: unless-stopped
    env_file: .env
    depends_on: [db]
    ports: ["127.0.0.1:3000:3000"]   # localhost only; exposed publicly via Caddy
volumes:
  pgdata:
```

- **`postgres:17`** – same major version as the local `docker-compose.yml`, so dev and prod behave alike. Pin the major: an automatic jump to 18 would not start on a 17 data directory.
- **`restart: unless-stopped`** – containers come back after a crash or VPS reboot.
- **No `ports` on `db`** – only the `server` container (same compose network) can reach Postgres. Publishing 5432 would expose your database to the internet.
- **`pgdata` named volume** – the database files live outside the container, so `docker compose up -d` with a new image never wipes data. (`docker compose down -v` **would** delete it; avoid `-v`.)
- **`${GHCR_OWNER}` / `${IMAGE_TAG}`** – compose reads these from the `.env` next to the compose file. The workflow rewrites them on each release, so the version you deploy is recorded on the server and a manual `docker compose` command uses the same version.
- **`env_file: .env`** – passes the app settings (`DATABASE_URL`, JWT secret, SMTP…) into the container. It is read when the container is **created**, so editing `.env` needs `up -d` to take effect.
- **`depends_on: [db]`** – starts the database first. It does not wait for Postgres to be *ready*; the server may fail its first migration and be restarted by `restart: unless-stopped`, which usually resolves itself within seconds.
- **`127.0.0.1:3000:3000`** – binds to localhost only, so the API is reachable from the internet only through Caddy (with HTTPS). Writing `"3000:3000"` would bypass both the proxy and `ufw`, because Docker edits iptables directly.

### `.github/workflows/deploy-server.yml`

```yaml
name: Deploy server
on:
  push:
    tags: ["v*"]

permissions:
  contents: read
  packages: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/server/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/padlock-server:${{ github.ref_name }}

      - name: Copy compose file
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          source: docker-compose.prod.yml
          target: ~/padlock

      - name: Deploy
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ~/padlock
            echo ${{ secrets.GHCR_PAT }} | docker login ghcr.io -u ${{ github.repository_owner }} --password-stdin
            sed -i '/^GHCR_OWNER=/d;/^IMAGE_TAG=/d' .env
            echo "GHCR_OWNER=${{ github.repository_owner }}" >> .env
            echo "IMAGE_TAG=${{ github.ref_name }}" >> .env
            docker compose -f docker-compose.prod.yml pull server
            docker compose -f docker-compose.prod.yml up -d
            docker image prune -f
```

- **`on.push.tags: ["v*"]`** – runs only when a tag starting with `v` is pushed. Branch pushes and PRs do nothing, which is what makes releases deliberate.
- **`permissions`** – least privilege for the built-in token: read the code, write packages (to push to GHCR). Nothing else.
- **`checkout`** – fetches the code at the tagged commit, so the image contains exactly what the tag points to.
- **`docker/login-action` with `GITHUB_TOKEN`** – authenticates CI to GHCR with a short-lived token; no secret to create or rotate.
- **`build-push-action`** – builds from the repo root with the server Dockerfile and pushes. `github.ref_name` is the tag name (`v1.0.0`), so the image tag always equals the git tag and you can trace any running container back to a commit.
- **No `latest` tag** – `latest` moves, so you could not tell what is running or roll back reliably.
- **Copy compose file** – keeps the compose file versioned in git and in sync with the image. The VPS never needs the repo cloned.
- **`docker login` on the VPS** – the GHCR package is private by default, and the CI token is not available on the VPS, so it uses the `GHCR_PAT`. `--password-stdin` keeps the token out of the process list.
- **`sed` + `echo` into `.env`** – delete any old `GHCR_OWNER` / `IMAGE_TAG` lines, then append the new ones. This makes the deploy repeatable and leaves your secrets untouched.
- **`pull server` then `up -d`** – pull first so the download finishes before anything is stopped; `up -d` then recreates only containers whose image or config changed (the database is left running).
- **`image prune -f`** – removes dangling old images so the disk does not fill up over many releases. Tagged images still in use are kept.

## Part 3: GitHub Secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | Contabo VPS IP |
| `VPS_SSH_KEY` | Contents of the private key `~/.ssh/padlock_deploy` |
| `GHCR_PAT` | Classic PAT with `read:packages`, so the VPS can pull the private image |

- **Why secrets** – they are encrypted, masked in logs, and not visible to forks' pull requests. Never put these values in the workflow file.
- **`VPS_SSH_KEY`** – paste the whole private key including the `BEGIN`/`END` lines. The matching public key is already on the VPS (Part 1).
- **`GHCR_PAT`** – the built-in `GITHUB_TOKEN` expires when the job ends, but the VPS must pull on its own (also on reboot and for manual rollbacks), so it needs a long-lived read-only token. Use a **classic** PAT with only `read:packages`; fine-grained tokens do not support GHCR. Set a calendar reminder for its expiry date: when it expires, pulls fail with `unauthorized`.

Release by pushing a tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

- Tag the commit you want to ship (usually the latest `main`). Use a new tag each time; re-pushing an existing tag name would overwrite an image you may want to roll back to.

Rollback: re-run the workflow for an older tag from the Actions tab, or on the VPS set `IMAGE_TAG=<old-tag>` in `~/padlock/.env` and run `docker compose -f docker-compose.prod.yml up -d`.

- **Why it works** – every release is a separate image, and old ones stay in GHCR, so going back is just pointing `IMAGE_TAG` at an old tag.
- **Caveat** – a rollback does not undo database migrations. If the newer release added a migration, make sure the older code still works with that schema, or restore a backup.

## Part 4: HTTPS with Caddy

Point your domain's A record (e.g. `api.yourdomain.com`) at the VPS IP, then on the VPS:

```bash
sudo apt install -y caddy
echo 'api.yourdomain.com { reverse_proxy 127.0.0.1:3000 }' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy issues and renews the SSL certificate automatically.

- **Why a reverse proxy** – the Nest app speaks plain HTTP on port 3000; Caddy terminates HTTPS on 443 and forwards to it. Login tokens and passwords must not travel unencrypted.
- **Why Caddy** – certificates from Let's Encrypt are obtained and renewed with no extra config (certbot cron jobs, nginx TLS blocks).
- **DNS first** – Let's Encrypt validates that the domain points at this server. If the A record has not propagated, certificate issuance fails; check with `dig api.yourdomain.com`.
- **Ports 80/443 open** – already done in the firewall step; Caddy needs both (80 for the validation challenge and redirects).
- **`127.0.0.1:3000`** – matches the localhost-only port binding in the compose file.

## Part 5: Seed the first admin

Add `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to `.env` on the VPS, deploy once (so `IMAGE_TAG` is set in `.env`), then:

```bash
docker compose -f docker-compose.prod.yml exec server pnpm db:seed
```

Afterwards remove those two variables from `.env`.

- **Why seed** – every admin route needs an admin JWT, and there is no public sign-up, so you need one account created from outside the API to log in at all.
- **Why add the variables first** – `seed.ts` reads them from the container environment. Because `env_file` is read when the container is created, run `docker compose -f docker-compose.prod.yml up -d` after editing `.env` so the container picks them up.
- **Why deploy once first** – the compose file needs `IMAGE_TAG` and `GHCR_OWNER`, which the workflow writes to `.env`; before the first release they do not exist.
- **Why remove them afterwards** – a plaintext initial password should not sit in a file longer than needed. Recreate the container (`up -d`) after removing them so it is gone from the container environment too, then change the password after first login.

## Notes

- If the Action fails, the usual suspects are the `argon2` build or `prisma generate`; check the `build-push-action` step log. A failed build stops before the deploy step, so production keeps running the previous version.
- `/docs` (Swagger) stays open in production (`main.ts` only skips writing `docs/swagger.json`). Block that route in Caddy if you don't want it exposed.
- Data lives in the `pgdata` volume. Enable Contabo snapshots or a `pg_dump` cron for backups; a volume is not a backup, since losing the VPS loses both.
- The image keeps devDependencies (the prisma CLI is needed to migrate at startup). Split into a multi-stage build later if the image gets too large.
- View logs: `docker compose -f docker-compose.prod.yml logs -f server`.
