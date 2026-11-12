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
    // Best-effort gh CLI on Debian/Ubuntu if missing
    `if ! command -v gh >/dev/null 2>&1; then`,
    `  if command -v apt-get >/dev/null 2>&1; then`,
    `    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gh >/dev/null 2>&1 || true`,
    `  elif command -v apk >/dev/null 2>&1; then`,
    `    apk add --no-cache github-cli >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    // Best-effort vercel CLI if npm is present and vercel is missing
    `if ! command -v vercel >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then`,
    `  npm install -g vercel >/dev/null 2>&1 || true`,
    `fi`,
    `exit 0`,
  ].join("\n");
}
