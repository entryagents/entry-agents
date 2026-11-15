import type { Metadata } from "next";
import { ExtensionsHeader } from "../_components/extensions-header";
import { SkillsSection } from "./skills-section";

export const metadata: Metadata = {
  title: "Agent Skills",
  description:
    "Browse built-in agent skills (/unslop, /frontend-design, /code-review) and install GitHub skill repositories.",
};

export default function SkillsPage() {
  return (
    <div className="space-y-6">
      <ExtensionsHeader
        title="Agent skills"
        description="Built-in domain skills and GitHub skill packs invoked automatically or via /skill-name in any chat."
      />
      <SkillsSection />
    </div>
  );
}
