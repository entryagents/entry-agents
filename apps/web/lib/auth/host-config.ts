function normalizeHost(value?: string): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`,
    ).host;
  } catch {
    return null;
  }
}

function getWildcardHostPattern(host: string): string | null {
  const hostname = host.split(":")[0];
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("[")
  ) {
    return null;
  }

  return `*.${host}`;
}

export function getAuthBaseURLFallback(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.BETTER_AUTH_URL) {
    return env.BETTER_AUTH_URL;
  }
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL;
  }
  if (env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`;
  }
  return undefined;
}

export function getAllowedAuthHosts(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const hosts = new Set<string>([
    "localhost:3000",
    "localhost:*",
    "127.0.0.1:3000",
    "127.0.0.1:*",
  ]);

  for (const value of [
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_SITE_URL,
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.NEXT_PUBLIC_VERCEL_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const host = normalizeHost(value);
    if (!host) {
      continue;
    }

    hosts.add(host);

    const wildcardPattern = getWildcardHostPattern(host);
    if (wildcardPattern) {
      hosts.add(wildcardPattern);
    }
  }

  return [...hosts];
}
