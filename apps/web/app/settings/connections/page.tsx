import type { Metadata } from "next";
import { Suspense } from "react";
import { StackHeader } from "../_components/stack-header";
import { AccountsSection, AccountsSectionSkeleton } from "../accounts-section";
import { VercelSection, VercelSectionSkeleton } from "../vercel-section";
import { ProviderConnectionsSection } from "../provider-connections-section";
import {
  ComposioToolkitsSection,
  ComposioToolkitsSectionSkeleton,
} from "./composio-toolkits-section";
import {
  IntegrationProvidersSection,
  IntegrationProvidersSectionSkeleton,
} from "./integration-providers-section";

export const metadata: Metadata = {
  title: "Connections",
  description:
    "Manage connected apps, developer platforms, and workspace tools.",
};

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <StackHeader
        title="Apps & accounts"
        description="Connect GitHub, Vercel, Gmail, Slack, Linear, Notion, and workspace tools via Composio so agents discover and run tools directly from chat."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<VercelSectionSkeleton />}>
          <VercelSection />
        </Suspense>
        <ProviderConnectionsSection />
      </div>
      <Suspense fallback={<AccountsSectionSkeleton />}>
        <AccountsSection />
      </Suspense>
      <Suspense fallback={<ComposioToolkitsSectionSkeleton />}>
        <ComposioToolkitsSection />
      </Suspense>
      <Suspense fallback={<IntegrationProvidersSectionSkeleton />}>
        <IntegrationProvidersSection />
      </Suspense>
    </div>
  );
}
