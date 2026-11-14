import {
  BUILTIN_SKILLS,
  extractSkillBody,
  getBuiltinSkillsMetadata,
} from "@entry-agents/agent";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";

export type SkillCategory =
  | "ui-design"
  | "architecture-review"
  | "ai-workflows"
  | "backend-cloud";

export interface BuiltinSkillCatalogEntry {
  name: string;
  description: string;
  category: SkillCategory;
  categoryLabel: string;
  fileCount: number;
  files: string[];
  instructionsPreview: string;
}

export interface GithubSkillPreset {
  id: string;
  source: string;
  skillName: string;
  title: string;
  description: string;
  categoryLabel: string;
}

const SKILL_CATEGORY_MAP: Record<
  string,
  { category: SkillCategory; label: string }
> = {
  unslop: { category: "ui-design", label: "UI & Design" },
  "frontend-design": { category: "ui-design", label: "UI & Design" },
  "baseline-ui": { category: "ui-design", label: "UI & Design" },
  "web-animation-design": { category: "ui-design", label: "UI & Design" },
  "emil-design-eng": { category: "ui-design", label: "UI & Design" },
  "web-design-guidelines": { category: "ui-design", label: "UI & Design" },
  "vercel-react-best-practices": {
    category: "architecture-review",
    label: "Architecture & Review",
  },
  "code-review": {
    category: "architecture-review",
    label: "Architecture & Review",
  },
  "plan-mode": {
    category: "architecture-review",
    label: "Architecture & Review",
  },
  "ai-sdk": { category: "ai-workflows", label: "AI & Workflows" },
  workflow: { category: "ai-workflows", label: "AI & Workflows" },
  composio: { category: "ai-workflows", label: "AI & Workflows" },
  "chat-sdk": { category: "ai-workflows", label: "AI & Workflows" },
  "agent-browser": { category: "ai-workflows", label: "AI & Workflows" },
  neon: { category: "backend-cloud", label: "Backend & Cloud" },
  "neon-postgres": { category: "backend-cloud", label: "Backend & Cloud" },
  sandbox: { category: "backend-cloud", label: "Backend & Cloud" },
};

const GITHUB_SKILL_PRESETS: GithubSkillPreset[] = [
  {
    id: "heydamir-unslop",
    source: "heydamir/unslop",
    skillName: "unslop",
    title: "Unslop (GitHub Upstream)",
    description:
      "Turns generic AI-generated interfaces into crisp, high-craft product UI by fixing spacing, tokens, typography, and motion.",
    categoryLabel: "UI & Design",
  },
  {
    id: "vercel-labs-react-best-practices",
    source: "vercel-labs/agent-skills",
    skillName: "vercel-react-best-practices",
    title: "Vercel React & Next.js Best Practices",
    description:
      "57 performance and architecture rules from Vercel Engineering for React 19 and Next.js App Router.",
    categoryLabel: "Architecture & Review",
  },
  {
    id: "vercel-labs-web-design-guidelines",
    source: "vercel-labs/agent-skills",
    skillName: "web-design-guidelines",
    title: "Vercel Web Interface Guidelines",
    description:
      "Accessibility, keyboard navigation, focus states, and layout polish rules for web interfaces.",
    categoryLabel: "UI & Design",
  },
  {
    id: "anthropics-frontend-design",
    source: "anthropics/skills",
    skillName: "frontend-design",
    title: "Anthropic Frontend Design",
    description:
      "Production-grade frontend aesthetic direction, typography pairing, and layout composition.",
    categoryLabel: "UI & Design",
  },
  {
    id: "vercel-ai-sdk",
    source: "vercel/ai",
    skillName: "ai-sdk",
    title: "Vercel AI SDK",
    description:
      "Up-to-date reference for streamText, generateText, ToolLoopAgent, useChat, and MCP tools.",
    categoryLabel: "AI & Workflows",
  },
  {
    id: "neondatabase-neon-postgres",
    source: "neondatabase/agent-skills",
    skillName: "neon-postgres",
    title: "Neon Serverless Postgres",
    description:
      "Connection pooling, database branching, Drizzle migrations, and serverless driver patterns.",
    categoryLabel: "Backend & Cloud",
  },
];

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return auth.response;
  }

  const metadataList = getBuiltinSkillsMetadata();
  const metadataByName = new Map(metadataList.map((m) => [m.name, m]));

  const builtinSkills: BuiltinSkillCatalogEntry[] = BUILTIN_SKILLS.map(
    (skill) => {
      const meta = metadataByName.get(skill.name);
      const rawSkillMd = skill.files["SKILL.md"] ?? "";
      const body = extractSkillBody(rawSkillMd).trim();
      const cat = SKILL_CATEGORY_MAP[skill.name] ?? {
        category: "ai-workflows" as const,
        label: "AI & Workflows",
      };
      const fileKeys = Object.keys(skill.files);

      return {
        name: skill.name,
        description: meta?.description ?? skill.name,
        category: cat.category,
        categoryLabel: cat.label,
        fileCount: fileKeys.length,
        files: fileKeys,
        instructionsPreview: body.slice(0, 6000),
      };
    },
  );

  return Response.json({
    builtinSkills,
    githubPresets: GITHUB_SKILL_PRESETS,
  });
}
