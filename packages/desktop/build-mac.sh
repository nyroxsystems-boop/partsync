#!/bin/bash
# ─── PartSync Desktop: Manual App Assembly ────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$SCRIPT_DIR"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"
BUILD_DIR="/tmp/partsync-desktop-build"

echo "🔨 PartSync Desktop Build"
echo "========================="

# 1. Clean
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/dist" "$BUILD_DIR/src"

# 2. Copy ONLY compiled JS files (not old build artifacts!)
echo "📂 Copying compiled JS..."
find "$DESKTOP_DIR/dist" -name "*.js" -maxdepth 1 -exec cp {} "$BUILD_DIR/dist/" \;
echo "  Copied $(ls "$BUILD_DIR/dist/"*.js | wc -l | xargs) JS files"

# 3. Copy renderer (HTML/CSS/JS)
cp -r "$DESKTOP_DIR/src/renderer" "$BUILD_DIR/src/renderer"

# 4. Standalone package.json
cat > "$BUILD_DIR/package.json" << 'EOF'
{
    "name": "partsync-desktop",
    "version": "1.0.0",
    "main": "dist/main.js",
    "dependencies": {
        "chokidar": "^3.6.0",
        "diff-match-patch": "^1.0.5",
        "socket.io-client": "^4.7.0",
        "electron-store": "^8.1.0",
        "auto-launch": "^5.0.6"
    }
}
EOF

# 5. Install production deps
echo "📦 Installing production dependencies..."
cd "$BUILD_DIR"
npm install --omit=dev --legacy-peer-deps 2>&1 | tail -2

# 6. Copy @partsync/shared (manual, no symlinks)
echo "📦 Copying @partsync/shared..."
mkdir -p "$BUILD_DIR/node_modules/@partsync/shared"
cp -r "$ROOT_DIR/packages/shared/dist" "$BUILD_DIR/node_modules/@partsync/shared/dist"
cp "$ROOT_DIR/packages/shared/package.json" "$BUILD_DIR/node_modules/@partsync/shared/package.json"

echo "  Total app size: $(du -sh "$BUILD_DIR" | cut -f1)"

# 7. Verify deps
echo "🔍 Verifying..."
for dep in chokidar diff-match-patch socket.io-client electron-store auto-launch @partsync/shared; do
    [ -d "$BUILD_DIR/node_modules/$dep" ] && echo "  ✅ $dep" || echo "  ❌ $dep"
done

# 8. Assemble .app from Electron framework
echo ""
echo "🏗️  Assembling PartSync.app..."
ELECTRON_APP="$ROOT_DIR/node_modules/electron/dist/Electron.app"
APP_DIR="$DESKTOP_DIR/dist/PartSync.app"
rm -rf "$APP_DIR"
cp -R "$ELECTRON_APP" "$APP_DIR"

# Rename binary
mv "$APP_DIR/Contents/MacOS/Electron" "$APP_DIR/Contents/MacOS/PartSync"

# Remove default app + default icon
rm -rf "$APP_DIR/Contents/Resources/default_app.asar"
rm -f "$APP_DIR/Contents/Resources/electron.icns"

# Insert our app code
cp -r "$BUILD_DIR" "$APP_DIR/Contents/Resources/app"
rm -f "$APP_DIR/Contents/Resources/app/package-lock.json"

# Copy custom icon
if [ -f "$DESKTOP_DIR/assets/icon.icns" ]; then
    cp "$DESKTOP_DIR/assets/icon.icns" "$APP_DIR/Contents/Resources/icon.icns"
    echo "  ✅ Custom icon installed"
else
    echo "  ⚠️  No icon.icns found, using default"
fi

# Custom Info.plist with icon
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>PartSync</string>
    <key>CFBundleIdentifier</key>
    <string>com.nyroxsystems.partsync</string>
    <key>CFBundleName</key>
    <string>PartSync</string>
    <key>CFBundleDisplayName</key>
    <string>PartSync</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>CFBundleIconName</key>
    <string>icon</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
</dict>
</plist>
PLIST

echo "  Bundle size: $(du -sh "$APP_DIR" | cut -f1)"

# 9. Proper codesigning for macOS 15 Sequoia
# Must sign each component individually, inside-out
echo "🔏 Signing for macOS 15 (per-binary)..."
xattr -cr "$APP_DIR" 2>/dev/null || true

FRAMEWORKS="$APP_DIR/Contents/Frameworks"

# Sign each helper app (inside-out order)
for helper in \
    "$FRAMEWORKS/Electron Helper.app" \
    "$FRAMEWORKS/Electron Helper (GPU).app" \
    "$FRAMEWORKS/Electron Helper (Plugin).app" \
    "$FRAMEWORKS/Electron Helper (Renderer).app"; do
    if [ -d "$helper" ]; then
        codesign --force --sign - --entitlements "$DESKTOP_DIR/entitlements.mac.plist" "$helper" 2>/dev/null
        echo "  ✅ Signed: $(basename "$helper")"
    fi
done

# Sign the Electron framework
if [ -d "$FRAMEWORKS/Electron Framework.framework" ]; then
    codesign --force --sign - "$FRAMEWORKS/Electron Framework.framework" 2>/dev/null
    echo "  ✅ Signed: Electron Framework"
fi

# Sign any .dylib files
find "$FRAMEWORKS" -name "*.dylib" -exec codesign --force --sign - {} \; 2>/dev/null

# Sign the main app last
codesign --force --sign - --entitlements "$DESKTOP_DIR/entitlements.mac.plist" "$APP_DIR" 2>/dev/null
echo "  ✅ Signed: PartSync.app"

# 10. Verify signature
echo ""
codesign --verify --deep --strict "$APP_DIR" 2>&1 && echo "✅ Signature valid!" || echo "⚠️  Signature check (app may still work)"

# 11. Install to /Applications
echo ""
echo "📦 Installing to /Applications..."
rm -rf /Applications/PartSync.app
cp -R "$APP_DIR" /Applications/PartSync.app

# Remove ALL quarantine flags so it opens like a normal app
xattr -rd com.apple.quarantine /Applications/PartSync.app 2>/dev/null || true
# Also remove from the source
xattr -rd com.apple.quarantine "$APP_DIR" 2>/dev/null || true

echo ""
echo "================================"
echo "✅ PartSync.app installed to /Applications/"
echo "   Just double-click to open!"
echo "🎉 Done!"
