import { SITE_URL } from "@/lib/site";

/**
 * llms-full.txt — the extended, answer-engine-shaped version of
 * /llms.txt. Kept in plain text so LLM crawlers can ingest the whole
 * product story without DOM noise: definitions, how sessions work,
 * pricing semantics and model support, written declaratively.
 */
const content = `# Entry Agents — full context for LLMs

> Entry Agents is an AI coding workspace for building software from an idea, uploaded files, or an optional GitHub repository. Git commits and pull requests are optional outputs, not prerequisites.

## What Entry Agents is

Entry Agents, also known as Entry or Entry Agents AI, (entry-agents.dev) is a plain-language AI coding workspace. Each session can begin empty, contain uploaded files, or connect to a GitHub repository. The agent can explore, research, edit, run commands, build applications, test results, explain unfamiliar code, and optionally help deliver the result through GitHub.

Key properties:

- Agents run in the cloud inside a persistent Workspace machine. Nothing is installed locally; sessions start from the browser after signing in with Vercel, Google or GitHub.
- Every session has an isolated Workspace with filesystem, outbound network and runtime access, on its own branch.
- Work ships through normal Git: branches, commits, diffs and pull requests.

## How a session works

1. Sign in and create a session from a blank Workspace, uploaded files, or a connected GitHub repository.
2. The platform provisions a private Workspace with filesystem, outbound network, and runtime access.
3. You describe the task in chat; the agent plans, researches, edits files, builds software, and runs commands.
4. If a repository is connected, the agent can commit to its session branch.
5. When the task is done, Git push and pull requests are available as optional delivery paths.
6. Sandboxes auto-hibernate when inactive and can be resumed; expired sandbox filesystems are discarded, while committed work persists in Git.

## Pricing and credits

Usage is credit-based for model usage. Entry Agents does not charge a separate Workspace or sandbox fee. The selected model and the amount of work affect credit usage. Current plans, prices, payment options, and limits are at ${SITE_URL}/pricing. Current model prices and context windows are at ${SITE_URL}/model.

## Public pages

- [Entry Agents](${SITE_URL}/): Product overview and sign-in.
- [Beginner guide](${SITE_URL}/guide): A complete guide for starting without a project, navigating the UI, prompting, reviewing work, GitHub, and credits.
- [AI coding agent](${SITE_URL}/ai-coding-agent): How the platform builds software with or without a repository.
- [Pricing](${SITE_URL}/pricing): Credit-based plans.
- [Models](${SITE_URL}/model): Supported models, prices and context windows.
- [Sign in](${SITE_URL}/login): Sign in with Vercel, Google or GitHub.

## References

- [llms.txt standard](https://llmstxt.org/): the convention this file and ${SITE_URL}/llms.txt follow.
- [Schema.org](https://schema.org/): the vocabulary used by this site's structured data.
- [Model prices and context windows](${SITE_URL}/model): current model choices, prices, and context windows.
- [Pricing](${SITE_URL}/pricing): credit-based plans and subscription details.

Canonical site: ${SITE_URL}
`;

export function GET() {
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
