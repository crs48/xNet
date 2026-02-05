#!/bin/bash
# xNet Hub install script for VPS (Docker-based).
# Usage: curl -fsSL https://xnet.fyi/install-hub.sh | bash
set -euo pipefail

echo ""
echo "========================================"
echo "       xNet Hub Installation"
echo "========================================"
echo ""

# ── Check for Docker ─────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "Docker not found. Installing Docker..."
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [ "$ID" = "ubuntu" ] || [ "$ID" = "debian" ]; then
      curl -fsSL https://get.docker.com | sh
      sudo usermod -aG docker "$USER"
      echo "Docker installed. You may need to log out and back in."
    else
      echo "Please install Docker manually: https://docs.docker.com/get-docker/"
      exit 1
    fi
  else
    echo "Please install Docker manually: https://docs.docker.com/get-docker/"
    exit 1
  fi
fi

# ── Create directories ───────────────────────────────────
sudo mkdir -p /opt/xnet-hub/data
sudo chown -R "$USER:$USER" /opt/xnet-hub

# ── Download compose file ────────────────────────────────
REPO_RAW="https://raw.githubusercontent.com/crs48/xNet/main/packages/hub"

curl -fsSL "$REPO_RAW/docker-compose.hub.yml" -o /opt/xnet-hub/docker-compose.yml

# ── Get domain from user ─────────────────────────────────
read -rp "Enter your domain (e.g., hub.example.com) [localhost]: " DOMAIN
DOMAIN="${DOMAIN:-localhost}"

# ── Create Caddyfile ─────────────────────────────────────
cat > /opt/xnet-hub/Caddyfile <<EOF
${DOMAIN} {
    reverse_proxy hub:4444
}
EOF

# ── Start services ───────────────────────────────────────
cd /opt/xnet-hub
docker compose up -d

echo ""
echo "========================================"
echo "       Installation Complete!"
echo "========================================"
echo ""
echo "Your xNet Hub is running at:"
echo "  WebSocket: wss://${DOMAIN}"
echo "  Health:    https://${DOMAIN}/health"
echo ""
echo "Configure your xNet apps: Settings > Hub > wss://${DOMAIN}"
echo ""
echo "Useful commands:"
echo "  cd /opt/xnet-hub && docker compose logs -f"
echo "  cd /opt/xnet-hub && docker compose down"
echo ""
echo "Docs: https://xnet.fyi/docs/guides/hub"
echo ""
