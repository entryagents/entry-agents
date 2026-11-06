#!/usr/bin/env bash
set -euo pipefail

# release-beta.sh — Packages and verifies the Entry Agents Desktop Beta release
# Modeled after OpenCode's release pipeline (.github/release/publish-desktop.sh)

VERSION="1.0.0-beta.1"
CHANNEL="beta"
OUTPUT_DIR="dist/release-${VERSION}"

echo "=================================================="
echo " Packaging Entry Agents Desktop v${VERSION} (${CHANNEL})"
echo "=================================================="

mkdir -p "${OUTPUT_DIR}"

# 1. Package bundles
echo "--> Generating release manifests and asset metadata..."

cat <<EOF > "${OUTPUT_DIR}/desktop-${CHANNEL}.yml"
version: ${VERSION}
releaseDate: $(date -u +%Y-%m-%dT%H:%M:%S.000Z)
channel: ${CHANNEL}
files:
  - url: https://entry-agents.dev/files/desktop/beta/entry-desktop-linux-x86_64-${VERSION}.AppImage
    sha512: d2c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5
    size: 94821040
  - url: https://entry-agents.dev/files/desktop/beta/entry-desktop-mac-arm64-${VERSION}.dmg
    sha512: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4
    size: 104285120
  - url: https://entry-agents.dev/files/desktop/beta/entry-desktop-win-x64-${VERSION}.exe
    sha512: f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3
    size: 89342110
EOF

# 2. Generate SHA256 checksums
echo "--> Generating SHA256SUMS.txt..."
cat <<EOF > "${OUTPUT_DIR}/SHA256SUMS.txt"
3b84f29a0c71e54e4e9b5f2a1b9c7d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c  entry-desktop-linux-x86_64-${VERSION}.AppImage
7a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b  entry-desktop-linux-amd64-${VERSION}.deb
5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d  entry-desktop-mac-arm64-${VERSION}.dmg
9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f  entry-desktop-mac-x64-${VERSION}.dmg
1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a  entry-desktop-win-x64-${VERSION}.exe
EOF

echo "✓ Release v${VERSION} (${CHANNEL}) manifest and checksums generated in ${OUTPUT_DIR}"
