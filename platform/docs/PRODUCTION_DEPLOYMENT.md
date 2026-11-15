# Production Deployment Guide — AetherForge Studio

## 1. Pre-Flight Configuration

1. Copy `.env.example` to `.env` inside `/home/user/rea/platform`:
   ```bash
   cp .env.example .env
   ```
2. Set an explicit 32+ character `AETHERFORGE_MASTER_KEY` (or back up `data/.master.key` securely—losing the master key renders encrypted secrets undecryptable):
   ```bash
   openssl rand -hex 32
   ```
3. Build the root REA runtime and AetherForge Studio production bundle:
   ```bash
   cd /home/user/rea && npm ci --engine-strict=false && npm run build && npm run mcp-catalog:generate
   cd /home/user/rea/platform && npm ci && npm run typecheck && npm run build
   ```

---

## 2. Option A — Docker & Docker Compose

```bash
cd /home/user/rea/platform
export AETHERFORGE_MASTER_KEY=$(openssl rand -hex 32)
docker compose up -d --build
```

- Persistent data (`aetherforge.sqlite`, workspaces, snapshots, deployments) is stored in the `aetherforge_data` named volume (`/app/platform/data`).
- Built-in container healthcheck probes `GET http://127.0.0.1:4100/api/health`.
- To enable the optional PostgreSQL container alongside Studio:
  ```bash
  docker compose --profile postgres up -d --build
  ```

---

## 3. Option B — Systemd Service (Bare-Metal / VM Linux)

Create `/etc/systemd/system/aetherforge.service`:

```ini
[Unit]
Description=AetherForge Studio Production Server
After=network.target

[Service]
Type=simple
User=aetherforge
WorkingDirectory=/opt/rea/platform
EnvironmentFile=/opt/rea/platform/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/rea/platform/dist/server/index.js
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aetherforge
sudo journalctl -u aetherforge -f
```

---

## 4. Reverse Proxy with TLS & SSE Streaming (Nginx)

Because AetherForge Studio streams real-time agent events over **Server-Sent Events** (`/api/projects/:id/events`) and proxies nested live previews (`/preview/:projectId/*`, `/deployed/:deploymentId/*`), disable response buffering and forward `X-Forwarded-Proto`:

```nginx
server {
    listen 443 ssl http2;
    server_name studio.example.com;

    ssl_certificate     /etc/letsencrypt/live/studio.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/studio.example.com/privkey.pem;

    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Required for SSE live agent event stream (/api/projects/:id/events)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

---

## 5. Backups & Disaster Recovery

Back up the `data/` directory together (database + master key + workspaces/snapshots):

```bash
tar -czf aetherforge-backup-$(date +%F).tar.gz \
  -C /opt/rea/platform/data \
  aetherforge.sqlite .master.key workspaces snapshots deployments
```

**Security reminder:** Store backups encrypted, since `.master.key` decrypts stored API keys and project secrets.

---

## 6. Cloud Target Adapters

Inside **Project Settings / Secrets**, configure provider credentials for external targets when deploying beyond the built-in `managed-sandbox` runtime:
- **Vercel:** `VERCEL_TOKEN`
- **Netlify:** `NETLIFY_AUTH_TOKEN`
- **Fly.io:** `FLY_API_TOKEN`
- **Railway:** `RAILWAY_TOKEN`
- **Render:** `RENDER_API_KEY`
- **Cloudflare Pages:** `CLOUDFLARE_API_TOKEN`
