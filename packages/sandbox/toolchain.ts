/**
 * Best-effort developer toolchain bootstrap script for newly provisioned sandboxes.
 *
 * Checks for common modern CLI tools (curl, jq, rg, tmux, python3, gh, vercel)
 * and installs missing OS packages when a package manager is available.
 * Every step is guarded with `|| true` so optional tool installation never
 * blocks sandbox startup.
 */
export function buildToolchainBootstrapScript(): string {
  return [
    `set +e`,
    // Skip apt/apk entirely if core utilities are already installed
    `MISSING_APT=""`,
    `for bin in curl jq tmux python3; do command -v "$bin" >/dev/null 2>&1 || MISSING_APT="$MISSING_APT $bin"; done`,
    `command -v rg >/dev/null 2>&1 || MISSING_APT="$MISSING_APT ripgrep"`,
    `if [ -n "$MISSING_APT" ]; then`,
    `  if command -v apt-get >/dev/null 2>&1; then`,
    `    DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $MISSING_APT >/dev/null 2>&1 || true`,
    `  elif command -v apk >/dev/null 2>&1; then`,
    `    apk add --no-cache $MISSING_APT >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // Best-effort gh CLI: prefer official static Linux release tarball (works on bare ubuntu:24.04 without extra apt repos)
    `if ! command -v gh >/dev/null 2>&1; then`,
    `  ARCH=$(uname -m); case "$ARCH" in x86_64|amd64) GH_ARCH=amd64 ;; aarch64|arm64) GH_ARCH=arm64 ;; *) GH_ARCH="" ;; esac`,
    `  if [ -n "$GH_ARCH" ] && command -v curl >/dev/null 2>&1; then`,
    `    GH_VER="2.67.0"; curl -fsSL "https://github.com/cli/cli/releases/download/v\${GH_VER}/gh_\${GH_VER}_linux_\${GH_ARCH}.tar.gz" | tar -xz -C /tmp >/dev/null 2>&1 && install -m 0755 "/tmp/gh_\${GH_VER}_linux_\${GH_ARCH}/bin/gh" /usr/local/bin/gh >/dev/null 2>&1 && rm -rf "/tmp/gh_\${GH_VER}_linux_\${GH_ARCH}" || true`,
    `  fi`,
    `  if ! command -v gh >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then`,
    `    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gh >/dev/null 2>&1 || true`,
    `  elif ! command -v gh >/dev/null 2>&1 && command -v apk >/dev/null 2>&1; then`,
    `    apk add --no-cache github-cli >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // Best-effort vercel CLI if npm or bun is present and vercel is missing
    `if ! command -v vercel >/dev/null 2>&1; then`,
    `  if command -v npm >/dev/null 2>&1; then`,
    `    npm install -g vercel >/dev/null 2>&1 || true`,
    `  elif command -v bun >/dev/null 2>&1; then`,
    `    bun add -g vercel >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    `exit 0`,
  ].join("\n");
}
