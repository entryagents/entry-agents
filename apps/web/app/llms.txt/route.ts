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
- [Builder guide](${SITE_URL}/guide): Hands-on playbook with quickstart paths, copy-ready prompt recipes, workspace controls, and turn-saving habits.
- [Architecture](${SITE_URL}/ai-coding-agent): Cloud workspace vs local IDE copilot comparison, turn execution lifecycle, and VM/credential isolation boundaries.
- [Pricing](${SITE_URL}/pricing): Credit-based plans for Entry Agents.
- [Models](${SITE_URL}/model): Supported model prices and context windows.
- [About](${SITE_URL}/about): Why Entry Agents exists and core engineering commitments.
- [Privacy Policy](${SITE_URL}/privacy): Account, workspace, integration, and billing data practices.
- [Terms of Service](${SITE_URL}/terms): Workspace access, credits, code ownership, and acceptable use.

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
