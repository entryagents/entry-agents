import { describe, expect, test } from "bun:test";
import { getAllowedAuthHosts, getAuthBaseURLFallback } from "./host-config";

describe("auth host config", () => {
  test("includes localhost wildcards and Vercel preview/branch/site hosts", () => {
    const hosts = getAllowedAuthHosts({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.com",
      NEXT_PUBLIC_SITE_URL: "https://site.example.com",
      VERCEL_URL: "entry-agents-abc.vercel.app",
      VERCEL_BRANCH_URL: "entry-agents-git-main.vercel.app",
      NEXT_PUBLIC_VERCEL_URL: "entry-agents-pub.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "entry.sh",
    } as unknown as NodeJS.ProcessEnv);

    expect(hosts).toContain("localhost:3000");
    expect(hosts).toContain("localhost:*");
    expect(hosts).toContain("127.0.0.1:*");
    expect(hosts).toContain("app.example.com");
    expect(hosts).toContain("site.example.com");
    expect(hosts).toContain("entry-agents-abc.vercel.app");
    expect(hosts).toContain("entry-agents-git-main.vercel.app");
    expect(hosts).toContain("entry-agents-pub.vercel.app");
    expect(hosts).toContain("entry.sh");
    expect(hosts).toContain("*.entry.sh");
  });

  test("resolves fallback URL in priority order BETTER_AUTH_URL -> NEXT_PUBLIC_SITE_URL -> VERCEL_URL", () => {
    expect(
      getAuthBaseURLFallback({
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://auth.example.com",
        NEXT_PUBLIC_SITE_URL: "https://site.example.com",
        VERCEL_URL: "preview.vercel.app",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("https://auth.example.com");

    expect(
      getAuthBaseURLFallback({
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://site.example.com",
        VERCEL_URL: "preview.vercel.app",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("https://site.example.com");

    expect(
      getAuthBaseURLFallback({
        NODE_ENV: "production",
        VERCEL_URL: "preview.vercel.app",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("https://preview.vercel.app");
  });
});
