# 08: Self-Hosted Hub Guide

> Complete documentation for running your own xNet Hub — the graduation path from demo

**Duration:** 3 days
**Dependencies:** Hub Docker image, documentation site

## Overview

Self-hosting gives users complete control over their data. This is the natural **graduation path** from the demo hub at `hub.xnet.fyi` — users who want to keep their data permanently deploy their own hub.

Options from easiest to most control:

1. **Railway** (easiest) — one-click deploy, same platform as demo hub
2. **Docker on VPS** — full control, any cloud provider
3. **Node.js directly** — no Docker required

## Target Experience

```bash
# Option 1: Deploy on Railway (easiest)
# Click "Deploy on Railway" button on xnet.fyi/docs/self-hosting

# Option 2: One command on VPS
curl -fsSL https://xnet.fyi/install-hub.sh | bash
```

After running, users have:

- Hub running on port 4444
- Automatic HTTPS via Caddy
- Systemd service for auto-restart
- Basic monitoring at /metrics

## Implementation

### 0. Railway One-Click Deploy (Recommended)

The fastest path from demo to self-hosted:

```markdown
<!-- site/src/content/docs/docs/self-hosting/index.mdx -->

## Deploy on Railway

The easiest way to run your own hub. Same platform as the demo hub, but with your own data and no eviction.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/xnet-hub)

After deploying:

1. Add a custom domain in Railway settings (e.g., `hub.yourdomain.com`)
2. Update your xNet app: Settings > Hub > `wss://hub.yourdomain.com`
3. Your data syncs to your hub — no more 10 MB limit or 24h eviction

**Cost:** ~$5/mo (Railway Hobby plan) — effectively free if usage is light.

**Key difference from demo:** No `--demo` flag means production defaults:

- 1 GB quota per user (configurable)
- No auto-eviction
- No document limits
```

### 1. Install Script (VPS)

```bash
#!/bin/bash
# install-hub.sh
# Usage: curl -fsSL https://xnet.fyi/install-hub.sh | bash

set -e

echo "
========================================
       xNet Hub Installation
========================================
"

# Detect OS
OS="unknown"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."

    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker $USER
    else
        echo "Please install Docker manually: https://docs.docker.com/get-docker/"
        exit 1
    fi
fi

# Create data directory
sudo mkdir -p /opt/xnet-hub/data
sudo chown -R $USER:$USER /opt/xnet-hub

# Download docker-compose.yml
curl -fsSL https://xnet.fyi/docker-compose.hub.yml -o /opt/xnet-hub/docker-compose.yml

# Get domain from user
read -p "Enter your domain (e.g., hub.example.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN="localhost"
fi

# Update config
sed -i "s/DOMAIN=.*/DOMAIN=$DOMAIN/" /opt/xnet-hub/docker-compose.yml

# Start services
cd /opt/xnet-hub
docker compose up -d

echo "
========================================
       Installation Complete!
========================================

Your xNet Hub is now running at:
  - WebSocket: wss://$DOMAIN
  - Health: https://$DOMAIN/health

Configure your xNet apps to use: wss://$DOMAIN

To view logs:
  cd /opt/xnet-hub && docker compose logs -f

To stop:
  cd /opt/xnet-hub && docker compose down

Documentation: https://xnet.fyi/docs/self-hosting
"
```

### 2. Docker Compose Configuration

```yaml
# docker-compose.hub.yml

version: '3.8'

services:
  hub:
    image: ghcr.io/xnet-dev/xnet-hub:latest
    container_name: xnet-hub
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=4444
      - DATA_DIR=/data
      - AUTH_MODE=ucan
      - LOG_LEVEL=info
    volumes:
      - ./data:/data
    networks:
      - xnet
    labels:
      - 'caddy=hub.${DOMAIN:-localhost}'
      - 'caddy.reverse_proxy={{upstreams 4444}}'

  caddy:
    image: lucaslorentz/caddy-docker-proxy:latest
    container_name: xnet-caddy
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - caddy_data:/data
    networks:
      - xnet

networks:
  xnet:
    driver: bridge

volumes:
  caddy_data:
```

### 3. Manual Installation Guide

```markdown
<!-- apps/static/src/content/docs/self-hosting/vps-guide.mdx -->

# VPS Installation Guide

This guide walks through setting up an xNet Hub on a fresh VPS.

## Prerequisites

- A VPS with at least 1GB RAM (2GB recommended)
- Ubuntu 22.04 or Debian 12
- A domain name pointing to your VPS
- SSH access

## Step 1: Initial Server Setup

SSH into your server and update packages:

\`\`\`bash
sudo apt update && sudo apt upgrade -y
\`\`\`

## Step 2: Install Docker

\`\`\`bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect

\`\`\`

## Step 3: Configure Firewall

\`\`\`bash
sudo ufw allow 22/tcp # SSH
sudo ufw allow 80/tcp # HTTP (for HTTPS redirect)
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable
\`\`\`

## Step 4: Create Directory Structure

\`\`\`bash
sudo mkdir -p /opt/xnet-hub/data
sudo chown -R $USER:$USER /opt/xnet-hub
cd /opt/xnet-hub
\`\`\`

## Step 5: Create docker-compose.yml

\`\`\`bash
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
hub:
image: ghcr.io/xnet-dev/xnet-hub:latest
container_name: xnet-hub
restart: unless-stopped
environment: - NODE_ENV=production - PORT=4444 - DATA_DIR=/data - AUTH_MODE=ucan - LOG_LEVEL=info
volumes: - ./data:/data
networks: - xnet
healthcheck:
test: ["CMD", "wget", "-q", "--spider", "http://localhost:4444/health"]
interval: 30s
timeout: 10s
retries: 3

caddy:
image: caddy:2-alpine
container_name: xnet-caddy
restart: unless-stopped
ports: - "80:80" - "443:443"
volumes: - ./Caddyfile:/etc/caddy/Caddyfile:ro - caddy_data:/data - caddy_config:/config
networks: - xnet
depends_on: - hub

networks:
xnet:

volumes:
caddy_data:
caddy_config:
EOF
\`\`\`

## Step 6: Create Caddyfile

Replace `hub.example.com` with your domain:

\`\`\`bash
cat > Caddyfile << 'EOF'
hub.example.com {
reverse_proxy hub:4444
}
EOF
\`\`\`

## Step 7: Start the Hub

\`\`\`bash
docker compose up -d
\`\`\`

## Step 8: Verify Installation

\`\`\`bash

# Check services are running

docker compose ps

# Check hub health

curl https://hub.example.com/health

# View logs

docker compose logs -f hub
\`\`\`

## Step 9: Configure Your Apps

In your xNet desktop or web app, go to Settings > Hub and enter:

\`\`\`
wss://hub.example.com
\`\`\`

## Updating

To update to the latest version:

\`\`\`bash
cd /opt/xnet-hub
docker compose pull
docker compose up -d
\`\`\`

## Backup

The hub stores all data in `/opt/xnet-hub/data`. To backup:

\`\`\`bash

# Stop hub first for consistency

docker compose stop hub
tar -czvf xnet-hub-backup-$(date +%Y%m%d).tar.gz data/
docker compose start hub
\`\`\`

## Troubleshooting

### Hub won't start

Check logs:
\`\`\`bash
docker compose logs hub
\`\`\`

### SSL certificate issues

Caddy automatically obtains certificates. If it fails:

\`\`\`bash
docker compose logs caddy
\`\`\`

Ensure:

- Port 80 and 443 are open
- DNS is pointing to your server
- No other service is using ports 80/443

### Connection refused

Verify the hub is listening:
\`\`\`bash
docker compose exec hub wget -q --spider http://localhost:4444/health
\`\`\`
```

### 4. Configuration Reference

```markdown
<!-- apps/static/src/content/docs/self-hosting/configuration.mdx -->

# Hub Configuration

The xNet Hub is configured via environment variables.

## Core Settings

| Variable    | Default       | Description                      |
| ----------- | ------------- | -------------------------------- |
| `PORT`      | `4444`        | WebSocket/HTTP port              |
| `DATA_DIR`  | `./data`      | Directory for SQLite and blobs   |
| `LOG_LEVEL` | `info`        | `debug`, `info`, `warn`, `error` |
| `NODE_ENV`  | `development` | Set to `production` in prod      |

## Authentication

| Variable                 | Default | Description                            |
| ------------------------ | ------- | -------------------------------------- |
| `AUTH_MODE`              | `ucan`  | `ucan` (require tokens) or `anonymous` |
| `REQUIRE_SIGNED_UPDATES` | `true`  | Reject unsigned Yjs updates            |

## Limits

| Variable              | Default      | Description                          |
| --------------------- | ------------ | ------------------------------------ |
| `MAX_CONNECTIONS`     | `1000`       | Max concurrent WebSocket connections |
| `MAX_MESSAGE_SIZE`    | `5242880`    | Max message size in bytes (5MB)      |
| `DEFAULT_QUOTA`       | `1073741824` | Storage quota per user (1GB)         |
| `RATE_LIMIT_MESSAGES` | `100`        | Max messages per window              |
| `RATE_LIMIT_WINDOW`   | `60000`      | Rate limit window in ms              |

## Advanced

| Variable          | Default  | Description                      |
| ----------------- | -------- | -------------------------------- |
| `STORAGE_BACKEND` | `sqlite` | `sqlite` or `memory`             |
| `SYNC_DEBOUNCE`   | `1000`   | Debounce persistence writes (ms) |
| `DOC_CACHE_SIZE`  | `100`    | Max Y.Docs to keep in memory     |

## Example: High-Traffic Configuration

\`\`\`yaml
environment:

- NODE_ENV=production
- PORT=4444
- DATA_DIR=/data
- AUTH_MODE=ucan
- LOG_LEVEL=warn
- MAX_CONNECTIONS=5000
- MAX_MESSAGE_SIZE=10485760
- DEFAULT_QUOTA=5368709120
- RATE_LIMIT_MESSAGES=200
- SYNC_DEBOUNCE=2000
- DOC_CACHE_SIZE=500
  \`\`\`

## Example: Development Configuration

\`\`\`yaml
environment:

- NODE_ENV=development
- PORT=4444
- DATA_DIR=./dev-data
- AUTH_MODE=anonymous
- LOG_LEVEL=debug
- REQUIRE_SIGNED_UPDATES=false
  \`\`\`
```

### 5. Systemd Service (Non-Docker)

```ini
# /etc/systemd/system/xnet-hub.service

[Unit]
Description=xNet Hub
After=network.target

[Service]
Type=simple
User=xnet
Group=xnet
WorkingDirectory=/opt/xnet-hub
ExecStart=/usr/bin/node /opt/xnet-hub/node_modules/@xnetjs/hub/dist/cli.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=xnet-hub

# Environment
Environment=NODE_ENV=production
Environment=PORT=4444
Environment=DATA_DIR=/opt/xnet-hub/data
Environment=AUTH_MODE=ucan
Environment=LOG_LEVEL=info

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/xnet-hub/data

[Install]
WantedBy=multi-user.target
```

```bash
# Non-Docker installation script
#!/bin/bash

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create user
sudo useradd -r -s /bin/false xnet

# Create directories
sudo mkdir -p /opt/xnet-hub/data
sudo chown -R xnet:xnet /opt/xnet-hub

# Install hub
cd /opt/xnet-hub
sudo -u xnet npm install @xnetjs/hub

# Install service
sudo cp /opt/xnet-hub/node_modules/@xnetjs/hub/systemd/xnet-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xnet-hub
sudo systemctl start xnet-hub

# Check status
sudo systemctl status xnet-hub
```

### 6. Monitoring Dashboard

```markdown
<!-- apps/static/src/content/docs/self-hosting/monitoring.mdx -->

# Monitoring Your Hub

The xNet Hub exposes Prometheus metrics at `/metrics`.

## Key Metrics

| Metric                           | Type      | Description                   |
| -------------------------------- | --------- | ----------------------------- |
| `xnet_hub_connections_active`    | Gauge     | Current WebSocket connections |
| `xnet_hub_rooms_active`          | Gauge     | Active sync rooms             |
| `xnet_hub_messages_total`        | Counter   | Total messages by type        |
| `xnet_hub_message_latency_ms`    | Histogram | Message processing time       |
| `xnet_hub_storage_bytes`         | Gauge     | Total storage used            |
| `xnet_hub_rate_limit_hits_total` | Counter   | Rate limit violations         |

## Grafana Dashboard

Import our pre-built dashboard:

1. Go to Grafana > Dashboards > Import
2. Paste this JSON:

\`\`\`json
{
"title": "xNet Hub",
"panels": [
{
"title": "Active Connections",
"type": "stat",
"targets": [{"expr": "xnet_hub_connections_active"}]
},
{
"title": "Messages/sec",
"type": "graph",
"targets": [{"expr": "rate(xnet_hub_messages_total[5m])"}]
},
{
"title": "Latency p95",
"type": "stat",
"targets": [{"expr": "histogram_quantile(0.95, rate(xnet_hub_message_latency_ms_bucket[5m]))"}]
}
]
}
\`\`\`

## Simple Health Monitoring

For basic monitoring without Grafana, use a cron job:

\`\`\`bash

# /etc/cron.d/xnet-hub-health

_/5 _ \* \* \* root curl -sf https://your-hub.example.com/health || echo "xNet Hub is down!" | mail -s "Alert" admin@example.com
\`\`\`

## Uptime Monitoring Services

Works with:

- UptimeRobot (free)
- Pingdom
- Better Uptime
- Healthchecks.io

Set up HTTP check for: `https://your-hub.example.com/health`
Expected response: `{"status":"ok"}`
```

### 7. Security Hardening Guide

```markdown
<!-- apps/static/src/content/docs/self-hosting/security.mdx -->

# Security Hardening

Best practices for securing your self-hosted hub.

## Network Security

### Firewall

Only expose necessary ports:

\`\`\`bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp # SSH (consider changing port)
sudo ufw allow 80/tcp # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable
\`\`\`

### Fail2ban

Protect against brute-force SSH attacks:

\`\`\`bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
\`\`\`

## TLS Configuration

Caddy handles TLS automatically with secure defaults. For manual nginx setup:

\`\`\`nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:50m;
ssl_stapling on;
ssl_stapling_verify on;
\`\`\`

## Rate Limiting

Configure appropriate limits:

\`\`\`yaml
environment:

- RATE_LIMIT_MESSAGES=100
- RATE_LIMIT_WINDOW=60000
- MAX_CONNECTIONS=1000
  \`\`\`

## Authentication

Always use UCAN authentication in production:

\`\`\`yaml
environment:

- AUTH_MODE=ucan
- REQUIRE_SIGNED_UPDATES=true
  \`\`\`

## Regular Updates

Keep your hub updated:

\`\`\`bash

# Add to cron for weekly updates

0 3 \* \* 0 cd /opt/xnet-hub && docker compose pull && docker compose up -d
\`\`\`

## Backups

Regular backups are essential:

\`\`\`bash
#!/bin/bash

# /opt/xnet-hub/backup.sh

BACKUP_DIR=/backups/xnet-hub
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# Stop hub for consistent backup

docker compose -f /opt/xnet-hub/docker-compose.yml stop hub

# Backup data

tar -czvf $BACKUP_DIR/xnet-hub-$DATE.tar.gz /opt/xnet-hub/data

# Restart hub

docker compose -f /opt/xnet-hub/docker-compose.yml start hub

# Keep only last 7 backups

find $BACKUP_DIR -name "xnet-hub-\*.tar.gz" -mtime +7 -delete
\`\`\`

## Security Checklist

- [ ] Firewall configured with minimal open ports
- [ ] SSH key-based authentication only
- [ ] Fail2ban installed and running
- [ ] TLS enabled with modern protocols
- [ ] UCAN authentication enabled
- [ ] Rate limiting configured
- [ ] Regular backups scheduled
- [ ] Automatic updates enabled
- [ ] Monitoring/alerting set up
```

## Testing

```typescript
describe('Self-Hosted Hub', () => {
  describe('Install Script', () => {
    it('downloads docker-compose.yml', async () => {
      const res = await fetch('https://xnet.fyi/docker-compose.hub.yml')
      expect(res.ok).toBe(true)
      const text = await res.text()
      expect(text).toContain('xnet-hub')
    })
  })

  describe('Docker Image', () => {
    it('starts successfully', async () => {
      const { stdout } = await exec(
        'docker run -d --name test-hub ghcr.io/xnet-dev/xnet-hub:latest'
      )
      const containerId = stdout.trim()

      // Wait for startup
      await sleep(5000)

      // Check health
      const { stdout: health } = await exec(
        `docker exec ${containerId} wget -qO- http://localhost:4444/health`
      )
      const json = JSON.parse(health)
      expect(json.status).toBe('ok')

      // Cleanup
      await exec(`docker rm -f ${containerId}`)
    })
  })
})
```

## Validation Gate

- [x] Railway one-click deploy template works
- [x] Install script works on fresh Ubuntu 22.04
- [x] Docker Compose starts hub with Caddy
- [x] HTTPS certificate obtained automatically
- [x] Health endpoint accessible
- [ ] WebSocket connections work
- [x] Graduation path from demo hub is clear and documented
- [x] Documentation is clear and complete
- [x] Backup/restore procedure documented
- [x] Security hardening guide complete

---

[Back to README](./README.md) | [Next: Hub CD Pipeline ->](./09-hub-cd.md)
