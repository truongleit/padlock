# Deploy the CMS web app to the VPS with GitHub Actions

> **This is a follow-up to [`DEPLOY_VPS_GUIDE.md`](./DEPLOY_VPS_GUIDE.md).** Do that guide first. It sets up the VPS (`deploy` user, firewall, Docker), Caddy, the `VPS_HOST` / `VPS_SSH_KEY` secrets, and the API at `https://api.truongle.me`. This guide only adds the web app on top of it.

Flow: push a `cms-v*` tag (e.g. `cms-v1.0.0`) → GitHub Actions builds the Vite app → copies `dist/` to the VPS over SSH → Caddy serves it at `https://cms.padlock.truongle.me`. Pushes to `main` and server tags (`v*`) do not deploy the web app.

**Why this shape?**

- **Static files, no Docker** – the web app is plain HTML/JS/CSS after `vite build`. Caddy already runs on the VPS, so serving a folder is one config block. No Node, container, or registry is needed for the web.
- **Build in CI** – `VITE_API_URL` is baked into the bundle at build time (`apps/web/src/env.ts`), so the API address is chosen in the workflow, not on the VPS.
- **Own tag prefix `cms-v*`** – the server workflow triggers on `v*`. A tag `cms-v1.0.0` starts with `c`, so it does **not** match `v*`. Web and server release independently and never trigger each other.

> The workflow and Caddy block below are **untested templates**. They are not in the repo yet; add them when you start deploying.

## Part 1: DNS (Namesilo)

Add one record on the same DNS page as the `api` record (see Part 4.1 of the server guide):

| Type | Hostname | Value | TTL |
| --- | --- | --- | --- |
| `A` | `cms.padlock` | `<VPS_IP>` | `3600` (or the minimum while testing) |

```bash
dig +short cms.padlock.truongle.me     # should print <VPS_IP>
```

- **Host `cms.padlock`** – Namesilo appends `.truongle.me`, giving `cms.padlock.truongle.me`. A host with two labels is fine; it is one ordinary record.
- **Wait for `dig` to match** before Part 2. Let's Encrypt validates the name and rate-limits repeated failures.

## Part 2: Prepare the VPS (one time)

SSH in as `deploy` and create the target folder:

```bash
sudo mkdir -p /var/www/padlock && sudo chown deploy:deploy /var/www/padlock
```

Append a site block to `/etc/caddy/Caddyfile` (`tee -a` adds to the end, so the existing `api.truongle.me` block stays), then validate and reload:

```bash
sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'EOF'

cms.padlock.truongle.me {
  root * /var/www/padlock/web
  encode gzip
  try_files {path} /index.html
  file_server
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- **Run it once** – running it twice appends a duplicate block and Caddy refuses to load it (`validate` will say so). Fix by editing the file: `sudo nano /etc/caddy/Caddyfile`.

- **`/var/www/padlock` owned by `deploy`, files go in `web/` below it** – CI connects as `deploy` and must be able to replace the folder. The workflow deletes and recreates `web/` on every release (`rm: true`), which needs write access to the parent. Do not use `/home/deploy/...`: on Ubuntu 24.04 home directories are not readable by the `caddy` user.
- **`try_files {path} /index.html`** – the app uses client-side routing (react-router). Opening `/forgot-password` directly, or refreshing on it, asks the server for a file that does not exist; this rule falls back to `index.html` so the router takes over. Without it you get 404 on every deep link.
- **`encode gzip`** – compresses JS/CSS responses; the antd bundle is large.
- **HTTPS is automatic** – same as the API: Caddy obtains and renews the certificate once DNS points here.

## Part 3: Point the server at the new origin

On the VPS, edit `~/padlock/.env`:

```env
ADMIN_WEB_ORIGIN=https://cms.padlock.truongle.me
```

```bash
cd ~/padlock && docker compose -f docker-compose.prod.yml up -d
```

- **Why** – `ADMIN_WEB_ORIGIN` is the CORS allow-list and the base of password-reset links. It must equal the browser's origin exactly (scheme, host, no trailing slash), or every request fails CORS.
- **`up -d` is required** – `env_file` is read when the container is created, so editing the file alone changes nothing.
- **No `ADMIN_COOKIE_CROSS_SITE`** – `cms.padlock.truongle.me` and `api.truongle.me` share the registrable domain `truongle.me`, so they are *same-site* and the default refresh cookie works. Only set it for an unrelated domain (e.g. `localhost` talking to the production API).
- If the old guide had `https://truongle.me` here, this replaces it.

## Part 4: The workflow

Create `.github/workflows/deploy-web.yml`:

```yaml
name: Deploy web
on:
  push:
    tags: ["cms-v*"]

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 25
          cache: pnpm
      - run: pnpm install --frozen-lockfile --filter web...
      - run: pnpm --filter web build
        env:
          VITE_API_URL: https://api.truongle.me

      - name: Upload to VPS
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          source: apps/web/dist/*
          strip_components: 3
          target: /var/www/padlock/web
          rm: true
```

- **`on.push.tags: ["cms-v*"]`** – only tags with this prefix. See the note at the top about why `v*` is not touched.
- **`pnpm/action-setup` with no version** – it reads the pinned `packageManager` field from the root `package.json`, so CI uses the same pnpm as local dev. It must come **before** `setup-node`, because `cache: pnpm` needs pnpm on the path.
- **`node-version: 25`** – matches `.tool-versions` (25.7.0). Pin the same major as local.
- **`--frozen-lockfile --filter web...`** – exact versions from the lockfile; only the web app and its workspace deps are installed.
- **`pnpm --filter web build`** – runs `tsc && vite build`. A type error fails the job **before** upload, so production keeps the previous version.
- **`VITE_API_URL` in the step `env`** – Vite inlines `VITE_*` variables into the bundle. It is public by design (it ends up in the browser), so it is not a secret.
- **`source: apps/web/dist/*` + `strip_components: 3`** – strips `apps/web/dist/` so the files land directly in `target`. Check `/var/www/padlock/web/index.html` exists after the first run; if it ends up nested, adjust the number.
- **`rm: true`** – clears the target folder before copying, so old hashed assets do not pile up. There is a brief moment (seconds) during upload where the site can be missing files; acceptable at this size.
- **Reused secrets** – `VPS_HOST` and `VPS_SSH_KEY` from Part 3 of the server guide. No new secrets, and no GHCR token (no image is involved).

## Part 5: Release and verify

```bash
git tag cms-v1.0.0 && git push origin cms-v1.0.0
```

- Use a new tag each time. To roll back, re-run the workflow for an older `cms-v*` tag from the Actions tab (it rebuilds that commit).

Verify:

```bash
curl -I https://cms.padlock.truongle.me            # 200, valid certificate
curl -I https://cms.padlock.truongle.me/forgot-password   # 200, not 404
```

Then in a browser: open the site, log in, and check DevTools → Network:

- Requests go to `https://api.truongle.me` (confirms `VITE_API_URL` was baked in).
- No CORS errors. If you see them, `ADMIN_WEB_ORIGIN` does not match (Part 3).
- Reload the page while logged in; the session should survive (the refresh cookie is sent to the API).

Troubleshooting:

- **Certificate error / timeout** – DNS not propagated yet, or ports 80/443 blocked (`sudo ufw status`). Logs: `sudo journalctl -u caddy -n 50 --no-pager`.
- **Default Caddy page or empty 404** – wrong `root` path, or the upload landed nested. `ls /var/www/padlock/web` should show `index.html` and `assets/`.
- **403** – the `caddy` user cannot read the folder: `sudo chmod -R o+rX /var/www/padlock`.
- **Blank page, console says `VITE_API_URL is not set`** – the build step did not get the env var; check the workflow step `env`.
- **Login works locally but not in production** – CORS or cookie; recheck `ADMIN_WEB_ORIGIN` and that both hosts are under `truongle.me`.

## Notes

- Security headers (CSP, HSTS) are not configured. Add a `header` block in the Caddy site when you want them.
- A CDN host (Cloudflare Pages, Vercel) is an alternative if you would rather not serve static files from the VPS. Not needed at this size.
