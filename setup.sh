#!/bin/bash
# ─── PartSync Setup Script ────────────────────────────────────────────────────
# Run this once to set up PartSync on your Mac

set -e

PARTSYNC_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_URL="${PARTSYNC_URL:-https://partsyncserver-production.up.railway.app}"
CLIENT_NAME="${PARTSYNC_NAME:-$(hostname)}"

echo ""
echo "  ⚡ PartSync Setup"
echo "  ════════════════════════════════════════"
echo ""
echo "  Server:  $SERVER_URL"
echo "  Client:  $CLIENT_NAME"
echo ""

# Step 1: Build if not already built
if [ ! -d "$PARTSYNC_DIR/packages/cli/dist" ]; then
  echo "  📦 Building PartSync..."
  cd "$PARTSYNC_DIR"
  npm install --legacy-peer-deps 2>/dev/null
  npm run build
  cp -r packages/server/src/dashboard packages/server/dist/ 2>/dev/null || true
  echo "  ✅ Build complete"
else
  echo "  ✅ Already built"
fi

# Step 2: Create global symlink
echo "  🔗 Creating 'partsync' command..."
SYMLINK_TARGET="/usr/local/bin/partsync"
cat > /tmp/partsync-launcher.sh << LAUNCHER
#!/bin/bash
node "$PARTSYNC_DIR/packages/cli/dist/index.js" "\$@"
LAUNCHER
chmod +x /tmp/partsync-launcher.sh

if [ -w "/usr/local/bin" ]; then
  mv /tmp/partsync-launcher.sh "$SYMLINK_TARGET"
else
  echo "  ⚠️  Need admin rights to install 'partsync' command globally."
  echo "  Running: sudo mv /tmp/partsync-launcher.sh $SYMLINK_TARGET"
  sudo mv /tmp/partsync-launcher.sh "$SYMLINK_TARGET"
fi

echo "  ✅ 'partsync' command installed"
echo ""
echo "  ════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  To sync a project, run:"
echo ""
echo "    partsync start --server $SERVER_URL --dir /path/to/your/project --name $CLIENT_NAME"
echo ""
echo "  Example:"
echo "    partsync start --server $SERVER_URL --dir ~/Desktop/autoteile-assistent --name aaron"
echo ""
echo "  Dashboard: $SERVER_URL"
echo "  ════════════════════════════════════════"
echo ""
