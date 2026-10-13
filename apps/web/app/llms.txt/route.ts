import { SITE_URL } from "@/lib/site";

const content = `# Entry Agents (also known as Entry)

> Entry Agents is an AI coding workspace for people who want to build software from an idea, uploaded files, or an optional GitHub repository. Git delivery is optional.

## Full context

Entry Agents, also known as Entry, helps you build software by describing what you want in plain language. Start with a blank Workspace, uploaded files, or an optional GitHub repository. The agent can research, edit files, run commands, build applications, test results, and explain its work. Git branches, commits, and pull requests are optional ways to deliver the result.

Key facts:

- Every session runs in an isolated sandbox no other session can reach; sandboxes hibernate when inactive and restore with filesystem state intact.
- Model usage is credit-based. There is no separate Workspace or sandbox fee. Current model prices and context windows are published at ${SITE_URL}/model.
- Sign-in uses Vercel, Google or GitHub OAuth; expired sandbox filesystems are discarded, while committed work persists in Git.

The extended version of this file, including the beginner navigation guide and pricing explanation, is at ${SITE_URL}/llms-full.txt.

## Public pages

- [Entry Agents](${SITE_URL}/): Product overview and sign-in.
- [Beginner guide](${SITE_URL}/guide): A complete beginner guide for starting without a project, navigating the UI, prompting the agent, reviewing work, GitHub, and credits.
- [AI coding agent](${SITE_URL}/ai-coding-agent): How Entry Agents builds software with or without a repository.
- [Pricing](${SITE_URL}/pricing): Credit-based plans for Entry Agents.
- [Models](${SITE_URL}/model): Supported model prices and context windows.

## Product capabilities

- Autonomous agents for building software, researching, editing files, and running commands.
- Workspace sandboxes with filesystem, outbound network, and runtime access.
- Optional Git branches, commits, and pull requests when a repository is connected.
- Durable, resumable agent workflows.

Canonical site: ${SITE_URL}
`;

export function GET() {
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
