#!/usr/bin/env bash
set -euo pipefail

# release-beta.sh — Computes real checksums and manifests for built Entry Agents Desktop artifacts

VERSION="${VERSION:-1.0.0-beta.1}"
CHANNEL="${CHANNEL:-beta}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-src-tauri/target/release/bundle}"
OUTPUT_DIR="${OUTPUT_DIR:-dist/release-${VERSION}}"

echo "=================================================="
echo " Packaging Entry Agents Desktop v${VERSION} (${CHANNEL})"
echo "=================================================="

if [ ! -d "${ARTIFACTS_DIR}" ]; then
  echo "Error: built artifacts directory '${ARTIFACTS_DIR}' not found. Run 'pnpm --dir apps/desktop build:tauri' first." >&2
  exit 1
fi

sha512_hex() {
  if command -v sha512sum >/dev/null 2>&1; then
    sha512sum "$1" | awk '{print $1}'
  else
    shasum -a 512 "$1" | awk '{print $1}'
  fi
}

sha256_hex() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

mapfile -t ARTIFACTS < <(find "${ARTIFACTS_DIR}" -maxdepth 3 -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.dmg' -o -name '*.exe' -o -name '*.msi' \) | sort)

if [ "${#ARTIFACTS[@]}" -eq 0 ]; then
  echo "Error: no desktop release binaries found under '${ARTIFACTS_DIR}'." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

{
  echo "version: ${VERSION}"
  echo "releaseDate: ${RELEASE_DATE}"
  echo "channel: ${CHANNEL}"
  echo "files:"
  for artifact in "${ARTIFACTS[@]}"; do
    filename="$(basename "${artifact}")"
    size_bytes="$(wc -c < "${artifact}" | tr -d '[:space:]')"
    hash512="$(sha512_hex "${artifact}")"
    echo "  - url: https://entry-agents.dev/files/desktop/${CHANNEL}/${filename}"
    echo "    sha512: ${hash512}"
    echo "    size: ${size_bytes}"
  done
} > "${OUTPUT_DIR}/desktop-${CHANNEL}.yml"

: > "${OUTPUT_DIR}/SHA256SUMS.txt"
for artifact in "${ARTIFACTS[@]}"; do
  filename="$(basename "${artifact}")"
  hash256="$(sha256_hex "${artifact}")"
  echo "${hash256}  ${filename}" >> "${OUTPUT_DIR}/SHA256SUMS.txt"
done

echo "✓ Release v${VERSION} (${CHANNEL}) manifest and checksums generated in ${OUTPUT_DIR}"
