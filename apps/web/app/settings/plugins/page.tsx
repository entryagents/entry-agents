import type { Metadata } from "next";
import { ExtensionsHeader } from "../_components/extensions-header";
import { PluginsSection } from "./plugins-section";

export const metadata: Metadata = {
  title: "Plugins",
  description:
    "Compose runtime lifecycle hooks, slash commands, and tool policies across agent sessions.",
};

export default function PluginsPage() {
  return (
    <div className="space-y-6">
      <ExtensionsHeader
        title="Plugins"
        description="Compose runtime lifecycle hooks, slash commands, tool policies, and compaction hints across every agent turn and subagent."
      />
      <PluginsSection />
    </div>
  );
}
