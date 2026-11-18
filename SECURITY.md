# Security Policy

## Reporting a Vulnerability

Please **do not** report security vulnerabilities, exposed credentials, or exploit details in public GitHub issues or pull requests.

To report a security issue privately:

1. Open a private vulnerability report via GitHub Security Advisories on the repository (`Security` -> `Advisories` -> `Report a vulnerability`), or contact the maintainers directly if advisories are unavailable.
2. Include a description of the affected component or file path, reproduction steps or proof-of-concept, and potential impact.

Please allow reasonable time to triage and patch confirmed issues before public disclosure.

## Security Architecture & Boundaries

Key trust boundaries enforced in the codebase:

- **Cloud Sandbox Isolation (`packages/sandbox/boxd`):** User VMs are provisioned with `isolated: true` to enforce network isolation between sandboxes and block cloud metadata endpoint access.
- **Ephemeral Git Credentials:** Repository clone and fetch operations inject short-lived tokens through an ephemeral mode-`0700` `GIT_ASKPASS` script deleted immediately after execution rather than embedding tokens in `git` remote URLs or `.git/config`.
- **Web Fetch SSRF Protection (`packages/agent/tools/fetch.ts`):** Blocks loopback, link-local (`169.254.0.0/16`), private RFC 1918, CGNAT (`100.64.0.0/10`), multicast/reserved IPv4, and private/ULA/multicast/documentation IPv6 ranges; validates every HTTP redirect hop and pins resolved IPs via `--resolve`.
- **Shell Approval Gating (`packages/agent/tools/bash.ts`):** Requires explicit user approval in `ask` mode for destructive operations, privilege escalation, package publishing, outbound raw transfers (`curl`, `wget`, `nc`, `scp`, `rsync`), and git push.
- **Request Validation & Auth:** API routes authenticate via Better Auth (`apps/web/lib/auth/config.ts`) and validate request payloads with Zod schemas (e.g., `apps/web/app/api/chat/_lib/request.ts`).
- **Desktop Client (`apps/desktop`):** Tauri 2 runs with `withGlobalTauri: false` and an explicit Content Security Policy in `src-tauri/tauri.conf.json`.
