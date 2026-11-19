import type { Metadata } from "next";
import { StackHeader } from "../_components/stack-header";
import { SecretsSection } from "./secrets-section";

export const metadata: Metadata = {
  title: "API Keys",
  description: "Bind private provider keys for workspace runs and MCP tools.",
};

export default function SecretsPage() {
  return (
    <div className="space-y-6">
      <StackHeader
        title="API keys"
        description="Save API keys once. Values stay encrypted on the server and are never shown to the agent."
      />
      <SecretsSection />
    </div>
  );
}
