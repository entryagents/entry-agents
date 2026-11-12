/**
 * Workspace File Metadata & Statistics Helpers
 */

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript React",
  js: "JavaScript",
  jsx: "JavaScript React",
  mjs: "JavaScript",
  cjs: "JavaScript",
  json: "JSON",
  jsonc: "JSON with Comments",
  json5: "JSON5",
  md: "Markdown",
  mdx: "MDX Document",
  markdown: "Markdown",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "SASS",
  less: "LESS",
  py: "Python",
  pyw: "Python",
  rs: "Rust",
  go: "Go",
  sh: "Shell Script",
  bash: "Bash Script",
  zsh: "Zsh Script",
  sql: "SQL",
  svg: "SVG Vector",
  png: "PNG Image",
  jpg: "JPEG Image",
  jpeg: "JPEG Image",
  gif: "GIF Image",
  webp: "WebP Image",
  pdf: "PDF Document",
  toml: "TOML",
  yaml: "YAML",
  yml: "YAML",
  graphql: "GraphQL",
  gql: "GraphQL",
  prisma: "Prisma Schema",
  c: "C",
  h: "C Header",
  cpp: "C++",
  hpp: "C++ Header",
  cs: "C#",
  java: "Java",
  kt: "Kotlin",
  rb: "Ruby",
  php: "PHP",
  swift: "Swift",
  tf: "Terraform",
};

const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: "Docker",
  "docker-compose.yml": "Docker Compose",
  "docker-compose.yaml": "Docker Compose",
  ".gitignore": "Git Ignore",
  ".env": "Environment Variables",
  ".env.local": "Environment Local",
  ".env.example": "Environment Example",
  "package.json": "Node Package",
  "cargo.toml": "Rust Manifest",
  "pnpm-lock.yaml": "PNPM Lockfile",
  "bun.lock": "Bun Lockfile",
  "tsconfig.json": "TypeScript Config",
};

export function getFileLanguage(filePath: string): string {
  const normalized = filePath.toLowerCase();
  const basename = normalized.split("/").pop() ?? normalized;

  if (SPECIAL_FILENAMES[basename]) {
    return SPECIAL_FILENAMES[basename];
  }

  const ext = basename.includes(".") ? (basename.split(".").pop() ?? "") : "";
  return (
    EXTENSION_LANGUAGE_MAP[ext] ?? (ext ? ext.toUpperCase() : "Plain Text")
  );
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const unit = units[i] ?? "B";
  const val = (bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1);
  return `${val} ${unit}`;
}

export type FileMetrics = {
  lines: number;
  characters: number;
  formattedSize: string;
};

export function computeFileMetrics(
  content: string,
  reportedBytes?: number,
): FileMetrics {
  const lines = content ? content.split(/\r\n|\r|\n/).length : 0;
  const characters = content ? content.length : 0;
  const bytes = reportedBytes ?? new TextEncoder().encode(content).length;
  return {
    lines,
    characters,
    formattedSize: formatBytes(bytes),
  };
}
