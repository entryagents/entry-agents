import type { Metadata } from "next";
import { SkillsSection } from "./skills-section";

export const metadata: Metadata = {
  title: "Agent Skills",
  description:
    "Browse built-in agent skills (/unslop, /frontend-design, /code-review) and install GitHub skill repositories.",
};

export default function SkillsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Agent Skills</h1>
        <p className="text-sm text-muted-foreground">
          Built-in domain skills and GitHub skill packs that Entry Agent can
          invoke automatically or via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            /skill-name
          </code>{" "}
          in any chat.
        </p>
      </div>

      <SkillsSection />
    </div>
  );
}
