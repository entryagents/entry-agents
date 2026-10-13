import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { SITE_URL } from "@/lib/site";

const title = "Entry Agents Complete Beginner Guide";
const description =
  "Learn Entry Agents from zero: how to sign in, start your first project without GitHub, navigate every main page, prompt a coding agent, use Workspaces, understand models and credits, connect GitHub, and review your work.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Entry Agents tutorial",
    "vibe coding for beginners",
    "AI coding agent tutorial",
    "how to use Entry Agents",
    "build an app with AI",
  ],
  alternates: { canonical: "/guide" },
  openGraph: { url: "/guide", title, description },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "HowTo",
      name: title,
      description,
      url: `${SITE_URL}/guide`,
      totalTime: "PT30M",
      step: [
        {
          "@type": "HowToStep",
          name: "Create an account",
          text: "Open Entry, choose a sign-in provider, and complete the account setup.",
        },
        {
          "@type": "HowToStep",
          name: "Start without a project",
          text: "Create a blank Workspace and describe the app you want to build in ordinary language.",
        },
        {
          "@type": "HowToStep",
          name: "Give the agent a clear task",
          text: "Describe the user, desired result, important screens, and how success should be checked.",
        },
        {
          "@type": "HowToStep",
          name: "Review the result",
          text: "Use the chat, files, diff, editor, preview, and checks to inspect and improve the work.",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Do I need GitHub to use Entry Agents?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. You can start with a blank Workspace or uploaded files. GitHub is optional.",
          },
        },
        {
          "@type": "Question",
          name: "Can a complete beginner build an app?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Start with a plain-language idea, then ask the agent to build one small part at a time and explain unfamiliar terms.",
          },
        },
        {
          "@type": "Question",
          name: "What do Entry credits pay for?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Credits pay for model usage. The amount depends on the selected model and the tokens used by each request. The live pricing and model pages show current details.",
          },
        },
      ],
    },
  ],
};

function CodePrompt({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-(--l-fg) p-5 font-mono text-sm leading-relaxed text-(--l-bg)">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title: heading,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-(--l-border) pt-12"
    >
      <h2 className="text-3xl font-semibold tracking-tight">{heading}</h2>
      <div className="mt-6 space-y-5 leading-relaxed text-(--l-fg-2)">
        {children}
      </div>
    </section>
  );
}

function PageLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="font-medium text-(--l-fg) underline underline-offset-4"
      href={href}
    >
      {children}
    </Link>
  );
}

export default function GuidePage() {
  return (
    <div className="landing min-h-screen bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[1080px] px-6 pb-24 pt-32 md:pt-44">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <p className="font-mono text-xs uppercase tracking-widest text-(--l-fg-3)">
          Start here
        </p>
        <h1 className="mt-4 max-w-5xl text-4xl font-semibold tracking-tighter sm:text-5xl md:text-6xl">
          The complete Entry Agents guide for new vibe coders.
        </h1>
        <p className="mt-6 max-w-4xl text-lg leading-relaxed text-(--l-fg-2)">
          You do not need an existing project, a GitHub account, or coding
          experience to begin. This guide starts at the beginning and explains
          what each main part of Entry means, what to click, what to type, and
          how credits and model usage work.
        </p>

        <nav
          aria-label="Guide contents"
          className="mt-12 rounded-xl border border-(--l-border) p-6"
        >
          <h2 className="font-semibold text-(--l-fg)">On this page</h2>
          <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <PageLink href="#first-project">Build your first project</PageLink>
            <PageLink href="#prompting">Prompt examples</PageLink>
            <PageLink href="#navigation">Every main page</PageLink>
            <PageLink href="#session">Inside a coding session</PageLink>
            <PageLink href="#credits">Pricing and credits</PageLink>
            <PageLink href="#github">GitHub and sharing</PageLink>
            <PageLink href="#troubleshooting">
              When something goes wrong
            </PageLink>
            <PageLink href="#glossary">Beginner glossary</PageLink>
          </div>
        </nav>

        <Section id="first-project" title="1. Start from zero, with no project">
          <p>
            Entry is a place where you describe software and an AI coding agent
            helps create it. If you have never built software before, begin with
            a small idea such as a personal landing page, a habit tracker, a
            simple calculator, or a small business booking page.
          </p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>
              Open <PageLink href="/login">Sign in</PageLink> and choose one of
              the available sign-in providers.
            </li>
            <li>
              After signing in, use{" "}
              <PageLink href="/get-started">Get Started</PageLink> if Entry
              shows the setup flow. Complete the account step. GitHub is
              optional, so do not connect it unless you want repository
              features.
            </li>
            <li>
              Open <PageLink href="/sessions">Sessions</PageLink> and create a
              new session. Choose a blank Workspace when you are starting a new
              idea.
            </li>
            <li>
              Give the agent a small first request. Do not ask for a huge
              company-sized product in one message. Ask for a foundation,
              inspect it, then add the next feature.
            </li>
            <li>
              Keep the session open while Entry creates files, runs commands,
              and explains its work. Read the result before asking for the next
              change.
            </li>
          </ol>
          <p>
            A Workspace is the working environment for the session. It is where
            the project files, commands, builds, tests, and previews live. You
            can start empty, upload files, or connect an existing repository
            later.
          </p>
        </Section>

        <Section
          id="prompting"
          title="2. Prompting when you are new to vibe coding"
        >
          <p>
            You do not need special prompt words. Tell Entry what you are
            making, who it is for, what it should look like, and how you will
            know it works. Ask it to explain unfamiliar words instead of
            pretending you understand them.
          </p>
          <h3 className="text-xl font-semibold text-(--l-fg)">
            First project: a simple website
          </h3>
          <CodePrompt>{`I am new to coding. Build a simple one-page website for a small Lagos bakery called Sunrise Bakes.
Use a warm, friendly style. Include a hero section, menu cards, opening hours, location, WhatsApp contact button, and a mobile layout.
Start by inspecting the blank Workspace, explain the files you create in simple language, then run the available checks.`}</CodePrompt>
          <h3 className="text-xl font-semibold text-(--l-fg)">
            First project: a useful personal tool
          </h3>
          <CodePrompt>{`Build a simple expense tracker for someone who is new to coding.
I need to add an expense, choose a category, see the total for this month, and delete an entry.
Use a clean mobile-first interface. Keep the first version small. After building it, tell me how each main file works and test the add, total, and delete flows.`}</CodePrompt>
          <h3 className="text-xl font-semibold text-(--l-fg)">
            Ask for a change
          </h3>
          <CodePrompt>{`The page looks good, but the main button is hard to notice on a phone.
Make the button clearer, improve spacing on small screens, and do not change the colors of the rest of the page.
Show me what you changed and check that the layout still works on desktop and mobile.`}</CodePrompt>
          <h3 className="text-xl font-semibold text-(--l-fg)">
            Ask for an explanation
          </h3>
          <CodePrompt>{`Explain this project like I have never coded before.
Tell me what the entry point is, where the page layout lives, where the data is stored, and what command checks whether the project works.
Do not change any files while explaining.`}</CodePrompt>
          <h3 className="text-xl font-semibold text-(--l-fg)">
            Ask for debugging help
          </h3>
          <CodePrompt>{`The app shows a blank screen after I click the Save button.
Please reproduce the problem, inspect the browser and server errors, find the smallest safe fix, test the fix, and explain the cause in beginner-friendly language.`}</CodePrompt>
          <h3 className="text-xl font-semibold text-(--l-fg)">
            A useful prompt pattern
          </h3>
          <p>
            <strong className="text-(--l-fg)">Context:</strong> what you are
            building. <strong className="text-(--l-fg)">Task:</strong> what
            should change. <strong className="text-(--l-fg)">Limits:</strong>{" "}
            what must not change.{" "}
            <strong className="text-(--l-fg)">Proof:</strong> how Entry should
            test or demonstrate success.
          </p>
        </Section>

        <Section id="navigation" title="3. How to navigate Entry’s pages">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Home</h3>
              <p>
                Explains Entry and gives you the main path into sign-in or a new
                session. Use it when you are deciding whether Entry fits your
                task.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                AI coding agent
              </h3>
              <p>
                <PageLink href="/ai-coding-agent">AI coding agent</PageLink>{" "}
                explains the product in more detail. It is useful when you want
                to understand the Workspace and coding-agent workflow before
                signing in.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                Get Started
              </h3>
              <p>
                <PageLink href="/get-started">Get Started</PageLink> is
                onboarding. It confirms your account and offers GitHub
                connection. GitHub is optional for a blank project.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Sessions</h3>
              <p>
                <PageLink href="/sessions">Sessions</PageLink> is your project
                and conversation home. Create a session for a project, open an
                existing one, search your sessions, or archive old work.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                Session chat
              </h3>
              <p>
                A chat is the conversation inside a session. Use it to give
                tasks, answer questions, request changes, stop a running turn,
                and continue iterating on the same Workspace.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Pricing</h3>
              <p>
                <PageLink href="/pricing">Pricing</PageLink> shows current plans
                and what each plan includes. Use it for plan comparison, not
                this guide, because prices and limits can change.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Models</h3>
              <p>
                <PageLink href="/model">Models</PageLink> shows available model
                choices and their current cost information. A stronger or more
                expensive model may be useful for a difficult task, while a
                cheaper model may be enough for a small edit.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                Shared pages
              </h3>
              <p>
                A shared session or chat link lets another person view permitted
                shared work. Treat shared links like access links and only share
                them with the people you intend to see the content.
              </p>
            </div>
          </div>
          <h3 className="mt-8 text-xl font-semibold text-(--l-fg)">
            Settings pages
          </h3>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-semibold text-(--l-fg)">Profile</h4>
              <p>Review your account identity and profile details.</p>
            </div>
            <div>
              <h4 className="font-semibold text-(--l-fg)">Accounts</h4>
              <p>Review connected sign-in accounts and account links.</p>
            </div>
            <div>
              <h4 className="font-semibold text-(--l-fg)">Models</h4>
              <p>Choose or inspect model availability for your sessions.</p>
            </div>
            <div>
              <h4 className="font-semibold text-(--l-fg)">Usage</h4>
              <p>
                Review usage and credit activity so you can understand where
                your credits went.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-(--l-fg)">Preferences</h4>
              <p>Adjust personal behavior and interface preferences.</p>
            </div>
            <div>
              <h4 className="font-semibold text-(--l-fg)">Connections</h4>
              <p>
                Manage service connections such as GitHub and other supported
                providers.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-(--l-fg)">MCP servers</h4>
              <p>
                Advanced tools that add external capabilities to an agent. Do
                not add one unless you understand what access it gives.
              </p>
            </div>
          </div>
        </Section>

        <Section id="session" title="4. Everything inside a coding session">
          <p>
            Once a session opens, think of the screen as a project control room.
            The chat is where you speak to the agent. The surrounding panels
            help you inspect the result.
          </p>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Chat</h3>
              <p>
                Send a request, read the agent’s explanation, inspect tool
                activity, and answer approval questions. If a task is running in
                the wrong direction, stop it and send a clearer request.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Files</h3>
              <p>
                Browse the files in the Workspace. Open a file when you want to
                inspect what the agent created or changed. Ask Entry to explain
                a file before editing it yourself.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Diff</h3>
              <p>
                A diff shows what changed compared with the previous state.
                Added lines, removed lines, and modified files are the fastest
                way to review an agent’s work.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Editor</h3>
              <p>
                The code editor lets you inspect and edit project files
                directly. Use the agent for larger changes and the editor for
                small, precise corrections.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                Preview and development server
              </h3>
              <p>
                When the project can run as an application, start its
                development server and open the preview. Test the same flow a
                real user would use, not just whether the code compiles.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                Git and commits
              </h3>
              <p>
                If the Workspace is connected to GitHub, inspect the branch and
                diff before committing. Ask Entry to create a commit message,
                then review and commit only changes you understand.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">Sharing</h3>
              <p>
                Use sharing when you want someone else to review a session or
                chat. Do not put passwords, private keys, or sensitive customer
                data in a shared session.
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="credits"
          title="5. Pricing, plans, and the credit lifecycle"
        >
          <p>
            Use the live <PageLink href="/pricing">pricing page</PageLink> for
            current plan names, prices, limits, and payment details. This guide
            explains the flow without hard-coding numbers that may change.
          </p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>
              You sign in and have an account with a plan or available credit
              balance.
            </li>
            <li>
              You choose a model for a session, or use the model default
              provided by Entry.
            </li>
            <li>
              You send a request. The request includes your conversation and the
              context needed for the agent’s next step.
            </li>
            <li>
              The selected model processes the request. Longer context, more
              output, tool-heavy work, and more complex tasks can use more
              credits.
            </li>
            <li>
              Entry records the usage and updates the balance through its normal
              billing path. The Usage area is where you review activity.
            </li>
            <li>
              When your balance or plan limit is low, choose a suitable model,
              shorten unnecessary context, wait for a reset where applicable, or
              use the billing page to manage your plan.
            </li>
          </ol>
          <p>
            There is no separate Workspace or sandbox charge. Credits pay for
            model usage, and the live pricing page is the source of truth for
            current plan prices and limits.
          </p>
          <h3 className="mt-8 text-xl font-semibold text-(--l-fg)">
            What happens from plan to renewal
          </h3>
          <ol className="mt-4 list-decimal space-y-3 pl-6">
            <li>
              Start on Free with a one-time $1 credit and access to the Free
              model. No card is required for the trial.
            </li>
            <li>
              Choose a paid plan when you need more credit or access to all
              models. Plus is $5/month for $10 credit, Entry is $13/month for
              $50 credit, Pro is $20/month for $100 credit, and Max is $40/month
              for $180 credit.
            </li>
            <li>
              Complete checkout. Your plan becomes active and its included
              credit is added to your balance.
            </li>
            <li>
              Each model request spends credit based on the model and the work
              involved. Longer conversations, larger answers, and tool-heavy
              tasks normally use more.
            </li>
            <li>
              Check the remaining balance and usage in Pricing or Settings →
              Usage. A top-up can add separate pay-as-you-go credit when that
              option is available.
            </li>
            <li>
              At the next successful monthly renewal, the plan charge is made
              and that plan’s included credit is added again. Existing balance
              is not silently replaced by the renewal grant.
            </li>
            <li>
              Entry has extra rolling usage windows: $10 over five hours, $25
              over seven days, and $50 over 30 days. These refill continuously
              as older usage leaves each window.
            </li>
            <li>
              If you cancel, checkout fails, or the balance is too low, review
              the billing page before starting expensive work. The plan page
              always shows the current prices and availability.
            </li>
          </ol>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="font-semibold text-(--l-fg)">Small edit</h3>
              <p>
                Use a lower-cost model when you only need a focused text or code
                change.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-(--l-fg)">New feature</h3>
              <p>
                Give the agent enough context and ask it to build and test one
                feature at a time.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-(--l-fg)">
                Large investigation
              </h3>
              <p>
                Ask for a plan first, then approve implementation. This avoids
                spending credits on a direction you did not want.
              </p>
            </div>
          </div>
        </Section>

        <Section id="github" title="6. GitHub, files, and sharing are optional">
          <p>
            You can learn vibe coding without GitHub. A blank Workspace is the
            best starting point for a new creator. Add uploaded files when you
            already have material to inspect. Connect GitHub when you want to
            work with a repository, branch, commits, diffs, or pull requests.
          </p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>Start with a blank Workspace if you have only an idea.</li>
            <li>
              Upload files if the project exists on your computer but is not in
              GitHub.
            </li>
            <li>
              Connect GitHub during onboarding or from Connections when the
              repository already exists.
            </li>
            <li>
              Choose the repository and branch carefully. Ask Entry to inspect
              before making broad changes.
            </li>
            <li>
              Review the diff, run checks, and decide whether to commit or
              create a pull request.
            </li>
          </ol>
        </Section>

        <Section id="troubleshooting" title="7. When something goes wrong">
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                The agent misunderstood
              </h3>
              <p>
                State the wrong assumption, the desired behavior, and one
                concrete example. Ask it to restate the plan before changing
                files.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                The result has an error
              </h3>
              <p>
                Paste the exact error or ask Entry to reproduce it. Request the
                smallest fix, a test, and a plain-language explanation.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                The preview is blank
              </h3>
              <p>
                Ask Entry to inspect the browser console, server output, route,
                and build command. Do not guess by changing many files at once.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                You are unsure what changed
              </h3>
              <p>
                Open the diff and ask: “Explain every changed file, why it
                changed, and which changes are necessary.” Revert or revise
                anything you cannot explain.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-(--l-fg)">
                A Workspace is unavailable
              </h3>
              <p>
                Check the session status, wait for a restore if it is waking up,
                and ask Entry to reconnect or inspect the Workspace state.
              </p>
            </div>
          </div>
        </Section>

        <Section id="glossary" title="8. Beginner glossary">
          <dl className="grid gap-6 md:grid-cols-2">
            <div>
              <dt className="font-semibold text-(--l-fg)">Agent</dt>
              <dd>The AI worker that plans and performs a task.</dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Vibe coding</dt>
              <dd>
                Building by describing intent in natural language, reviewing
                results, and iterating with an AI coding tool.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Session</dt>
              <dd>A project-level workspace and its conversations.</dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Chat</dt>
              <dd>
                The conversation where you give the agent instructions and
                receive results.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Workspace</dt>
              <dd>
                The private working environment containing files, commands,
                builds, and tests.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Model</dt>
              <dd>The AI system selected to process a request.</dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Credits</dt>
              <dd>The usage balance applied to model requests.</dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Diff</dt>
              <dd>A view showing added, removed, and changed lines.</dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Branch</dt>
              <dd>A separate line of Git work used to isolate changes.</dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Commit</dt>
              <dd>A saved checkpoint of changes in Git.</dd>
            </div>
            <div>
              <dt className="font-semibold text-(--l-fg)">Pull request</dt>
              <dd>
                A request for changes from one Git branch to be reviewed and
                merged into another.
              </dd>
            </div>
          </dl>
        </Section>

        <section className="mt-16 rounded-xl border border-(--l-border) p-6">
          <h2 className="text-2xl font-semibold">Your first five minutes</h2>
          <ol className="mt-5 list-decimal space-y-3 pl-6 leading-relaxed text-(--l-fg-2)">
            <li>Sign in.</li>
            <li>Create a blank Workspace.</li>
            <li>
              Paste the bakery, expense tracker, or personal website prompt
              above.
            </li>
            <li>Ask Entry to explain the files it created.</li>
            <li>
              Open the preview, try the main flow, and ask for one improvement.
            </li>
          </ol>
          <p className="mt-6">
            <PageLink href="/get-started">Start with Get Started</PageLink> or{" "}
            <PageLink href="/sessions">open Sessions</PageLink>.
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
