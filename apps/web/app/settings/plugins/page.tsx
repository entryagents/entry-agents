import type { Metadata } from "next";
import { PluginsSection } from "./plugins-section";

export const metadata: Metadata = {
  title: "Plugins",
  description:
    "Compose runtime lifecycle hooks, slash commands, and tool policies across agent sessions.",
};

export default function PluginsPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Plugins
        </h1>
        <p className="text-sm text-muted-foreground">
          Extend agent sessions with built-in guardrails, slash commands, and
          custom manifests
        </p>
      </div>
      <PluginsSection />
    </div>
  );
}
