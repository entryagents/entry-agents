import type { Metadata } from "next";
import { StackHeader } from "../_components/stack-header";
import { McpServersSection } from "../mcp-servers-section";

export const metadata: Metadata = {
  title: "MCP Servers",
  description: "Connect external MCP servers to extend the agent's tools.",
};

export default function McpServersPage() {
  return (
    <div className="space-y-6">
      <StackHeader
        title="Custom MCP tools"
        description="Attach remote HTTP endpoints or sandbox stdio tools alongside your connected workplace apps."
      />
      <McpServersSection />
    </div>
  );
}
