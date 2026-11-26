/**
 * Best-effort developer toolchain bootstrap script for newly provisioned sandboxes.
 *
 * Checks for common modern runtimes and CLI tools (node, npm, pnpm, bun, git,
 * curl, wget, jq, rg, fd, tree, sqlite3, tmux, python3, pip, uv, gh, vercel,
 * sightline) and installs missing packages when a package manager is available.
 * Every step is guarded with `|| true` so optional tool installation never
 * blocks sandbox startup.
 */
export function buildToolchainBootstrapScript(): string {
  return [
    `set +e`,
    // 1. Core OS utilities & build tools (skip apt/apk if all are already present)
    `MISSING_APT=""`,
    `for bin in curl wget git jq tmux python3 sqlite3 tree unzip zip; do command -v "$bin" >/dev/null 2>&1 || MISSING_APT="$MISSING_APT $bin"; done`,
    `command -v rg >/dev/null 2>&1 || MISSING_APT="$MISSING_APT ripgrep"`,
    `command -v fd >/dev/null 2>&1 || command -v fdfind >/dev/null 2>&1 || MISSING_APT="$MISSING_APT fd-find"`,
    `command -v pip3 >/dev/null 2>&1 || MISSING_APT="$MISSING_APT python3-pip"`,
    `command -v gcc >/dev/null 2>&1 || MISSING_APT="$MISSING_APT build-essential"`,
    `if [ -n "$MISSING_APT" ]; then`,
    `  if command -v apt-get >/dev/null 2>&1; then`,
    `    DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates gnupg $MISSING_APT >/dev/null 2>&1 || true`,
    `  elif command -v apk >/dev/null 2>&1; then`,
    `    APK_PKGS=$(echo "$MISSING_APT" | sed 's/fd-find/fd/g; s/python3-pip/py3-pip/g; s/build-essential/build-base/g')`,
    `    apk add --no-cache $APK_PKGS >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // Symlink fdfind -> fd on Debian/Ubuntu if needed
    `if ! command -v fd >/dev/null 2>&1 && command -v fdfind >/dev/null 2>&1; then`,
    `  ln -sf "$(command -v fdfind)" /usr/local/bin/fd >/dev/null 2>&1 || true`,
    `fi`,
    // 2. Node.js 22 LTS & npm
    `if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then`,
    `  if command -v apt-get >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then`,
    `    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null 2>&1 || true`,
    `  elif command -v apk >/dev/null 2>&1; then`,
    `    apk add --no-cache nodejs npm >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // 3. pnpm (via npm)
    `if ! command -v pnpm >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then`,
    `  npm install -g pnpm >/dev/null 2>&1 || true`,
    `fi`,
    // 4. Bun runtime
    `if ! command -v bun >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then`,
    `  curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || true`,
    `  if [ -x "$HOME/.bun/bin/bun" ]; then`,
    `    ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun >/dev/null 2>&1 || true`,
    `    ln -sf "$HOME/.bun/bin/bunx" /usr/local/bin/bunx >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // 5. uv (fast Python package/environment manager)
    `if ! command -v uv >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then`,
    `  curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1 || true`,
    `  if [ -x "$HOME/.local/bin/uv" ]; then`,
    `    ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // 6. GitHub CLI (gh): prefer official static Linux release tarball
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
    // 7. Vercel CLI
    `if ! command -v vercel >/dev/null 2>&1; then`,
    `  if command -v npm >/dev/null 2>&1; then`,
    `    npm install -g vercel >/dev/null 2>&1 || true`,
    `  elif command -v bun >/dev/null 2>&1; then`,
    `    bun add -g vercel >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // 8. Sightline codebase indexer CLI (best-effort)
    `if ! command -v sightline >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then`,
    `  python3 -m pip install --user --break-system-packages -q git+https://github.com/thirdbase1/sightline.git >/dev/null 2>&1 || python3 -m pip install --user -q git+https://github.com/thirdbase1/sightline.git >/dev/null 2>&1 || true`,
    `  if [ -x "$HOME/.local/bin/sightline" ]; then`,
    `    ln -sf "$HOME/.local/bin/sightline" /usr/local/bin/sightline >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    `exit 0`,
  ].join("\n");
}
