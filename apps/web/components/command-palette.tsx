"use client";

import {
  Activity,
  Blocks,
  Cable,
  CircleDashed,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  Network,
  Plug,
  Plus,
  Settings,
  SlidersHorizontal,
  Sun,
  Terminal,
  User,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ThemePreference } from "@/app/providers";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { SessionWithUnread } from "@/hooks/use-sessions";

const MAX_PALETTE_SESSIONS = 10;

interface PalettePluginCommand {
  name: string;
  description: string;
  pluginName?: string;
}

export function CommandPalette({
  theme,
  setTheme,
}: {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionWithUnread[]>([]);
  const [pluginCommands, setPluginCommands] = useState<PalettePluginCommand[]>(
    [],
  );
  const [loadingSessions, setLoadingSessions] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const isInSession = pathname?.startsWith("/sessions/") ?? false;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    const handleOpenEvent = () => {
      setOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("entry:open-command-palette", handleOpenEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("entry:open-command-palette", handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoadingSessions(true);

    fetch("/api/sessions?status=active", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          sessions?: SessionWithUnread[];
        } | null;
        if (Array.isArray(data?.sessions)) {
          setSessions(data.sessions.slice(0, MAX_PALETTE_SESSIONS));
        }
      })
      .catch(() => {
        // Ignore abort or unauthenticated 401 quietly inside palette
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingSessions(false);
        }
      });

    fetch("/api/plugins/commands", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          commands?: PalettePluginCommand[];
        } | null;
        if (Array.isArray(data?.commands)) {
          setPluginCommands(data.commands);
        }
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }, [open]);

  const runAction = useCallback((action: () => void) => {
    setOpen(false);
    action();
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Jump to sessions, plugins, settings, or workspace controls"
    >
      <CommandInput placeholder="Search sessions, settings, or /commands..." />
      <CommandList>
        <CommandEmpty>No matching commands or sessions found.</CommandEmpty>

        <CommandGroup heading="Workspace">
          <CommandItem
            onSelect={() => runAction(() => router.push("/sessions"))}
          >
            <Plus />
            <span>New Session</span>
          </CommandItem>
          {isInSession && (
            <CommandItem
              onSelect={() =>
                runAction(() => {
                  window.dispatchEvent(
                    new CustomEvent("entry:toggle-agent-hub"),
                  );
                })
              }
            >
              <Network />
              <span>Toggle Agent Team Hub</span>
              <CommandShortcut>Alt+A</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        {isInSession && pluginCommands.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Plugin Slash Commands">
              {pluginCommands.map((cmd) => (
                <CommandItem
                  key={cmd.name}
                  value={`/${cmd.name} ${cmd.description} ${cmd.pluginName ?? ""}`}
                  onSelect={() =>
                    runAction(() => {
                      window.dispatchEvent(
                        new CustomEvent("entry:insert-composer-prompt", {
                          detail: { text: `/${cmd.name} ` },
                        }),
                      );
                    })
                  }
                >
                  <Terminal />
                  <span className="font-mono font-medium">/{cmd.name}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {cmd.description}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(sessions.length > 0 || loadingSessions) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Sessions">
              {loadingSessions && sessions.length === 0 ? (
                <CommandItem disabled>
                  <Loader2 className="animate-spin" />
                  <span>Loading sessions...</span>
                </CommandItem>
              ) : (
                sessions.map((session) => {
                  const targetHref = session.latestChatId
                    ? `/sessions/${session.id}/chats/${session.latestChatId}`
                    : `/sessions/${session.id}`;
                  const repoLabel =
                    session.repoOwner && session.repoName
                      ? `${session.repoOwner}/${session.repoName}`
                      : null;
                  return (
                    <CommandItem
                      key={session.id}
                      value={`${session.title} ${repoLabel ?? ""} ${session.branch ?? ""}`}
                      onSelect={() => runAction(() => router.push(targetHref))}
                    >
                      {session.hasStreaming ? (
                        <Loader2 className="animate-spin text-emerald-500" />
                      ) : (
                        <CircleDashed />
                      )}
                      <span className="truncate">{session.title}</span>
                      {repoLabel && (
                        <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground max-w-[180px]">
                          {repoLabel}
                        </span>
                      )}
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Settings & Extensions">
          <CommandItem
            onSelect={() => runAction(() => router.push("/settings/plugins"))}
          >
            <Blocks />
            <span>Plugins &amp; Runtime Hooks</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runAction(() => router.push("/settings/mcp-servers"))
            }
          >
            <Plug />
            <span>MCP Servers</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => router.push("/settings/secrets"))}
          >
            <KeyRound />
            <span>API Keys &amp; Secrets</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => router.push("/settings/models"))}
          >
            <SlidersHorizontal />
            <span>Models</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => router.push("/settings/usage"))}
          >
            <Activity />
            <span>Usage &amp; Balance</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runAction(() => router.push("/settings/preferences"))
            }
          >
            <Settings />
            <span>Preferences</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runAction(() => router.push("/settings/connections"))
            }
          >
            <Cable />
            <span>Connections</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => router.push("/settings/profile"))}
          >
            <User />
            <span>Profile</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Appearance">
          <CommandItem onSelect={() => runAction(() => setTheme("light"))}>
            <Sun />
            <span>Theme: Light</span>
            {theme === "light" && <CommandShortcut>Active</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => setTheme("dark"))}>
            <Moon />
            <span>Theme: Dark</span>
            {theme === "dark" && <CommandShortcut>Active</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => setTheme("system"))}>
            <Monitor />
            <span>Theme: System</span>
            {theme === "system" && <CommandShortcut>Active</CommandShortcut>}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
