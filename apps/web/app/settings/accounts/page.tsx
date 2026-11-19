import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsSection, AccountsSectionSkeleton } from "../accounts-section";
import { ProviderConnectionsSection } from "../provider-connections-section";
import { VercelSection, VercelSectionSkeleton } from "../vercel-section";

export const metadata: Metadata = {
  title: "Accounts",
  description:
    "Manage your linked GitHub, Vercel, and Google authentication connections.",
};

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 border-b border-border/70 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connected accounts
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Link GitHub, Vercel, and Google for sign-in, repository permissions,
          and deployments. External toolkits and API keys live in Integrations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<VercelSectionSkeleton />}>
          <VercelSection />
        </Suspense>
        <ProviderConnectionsSection />
      </div>

      <Suspense fallback={<AccountsSectionSkeleton />}>
        <AccountsSection />
      </Suspense>
    </div>
  );
}
