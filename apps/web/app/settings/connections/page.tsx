import type { Metadata } from "next";
import { Suspense } from "react";
import { StackHeader } from "../_components/stack-header";
import {
  ComposioToolkitsSection,
  ComposioToolkitsSectionSkeleton,
} from "./composio-toolkits-section";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Connect workspace apps, custom MCP tools, and API keys for your agents.",
};

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <StackHeader
        title="Integrations"
        description="Connect Gmail, Slack, Linear, Notion, custom MCP servers, and API keys so your agents can work across your stack."
      />
      <Suspense fallback={<ComposioToolkitsSectionSkeleton />}>
        <ComposioToolkitsSection />
      </Suspense>
    </div>
  );
}
