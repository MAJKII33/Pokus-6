#!/bin/bash

# Fly.io Ultimate Fix - řeší všechny deployment problémy
set -e

echo "🔧 Fly.io Ultimate Deployment Fix"
echo "=================================="

# Kontrola existence souborů
if [ ! -f "package-flyio.json" ]; then
    echo "❌ Chyba: package-flyio.json nenalezen!"
    echo "Ujistěte se, že jste rozbalili medtrum-flyio-bypass.tar.gz"
    exit 1
fi

echo "📁 Přejmenovávám soubory..."
# Nejdříve přejmenuj - pak deploy
mv package-flyio.json package.json
mv Dockerfile-flyio Dockerfile  
mv server-flyio.js server.js

echo "✅ Soubory přejmenovány:"
echo "  ✓ package.json"
echo "  ✓ Dockerfile"
echo "  ✓ server.js"

# Vytvoř minimální fly.toml
echo "📝 Vytvářím fly.toml konfiguraci..."
cat > fly.toml << 'EOF'
app = "pokus-4-fly-io"
primary_region = "fra"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["http", "tls"]

  [[services.http_checks]]
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
    method = "get"
    path = "/health"

[[vm]]
  memory_mb = 512
EOF

echo "🚀 Spouštím deployment..."
flyctl deploy -a pokus-4-fly-io --config fly.toml

echo "✅ Deployment dokončen!"
echo "🌐 Aplikace dostupná na: https://pokus-4-fly-io.fly.dev"