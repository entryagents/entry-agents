"use client";

import { Blocks, Bot, Terminal, Users, X } from "lucide-react";
import { useState } from "react";
import type { SkillSuggestion } from "@/app/api/sessions/[sessionId]/skills/route";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function SkillSourceIcon({
  source,
  name,
}: {
  source?: SkillSuggestion["source"];
  name: string;
}) {
  if (source === "plugin") {
    return (
      <Blocks
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
      />
    );
  }
  if (source === "team" && (name === "team" || name === "team-plan")) {
    return <Users className="size-4 shrink-0 text-primary" strokeWidth={1.5} />;
  }
  if (source === "team") {
    return (
      <Bot
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
      />
    );
  }
  return (
    <Terminal
      className="size-4 shrink-0 text-muted-foreground"
      strokeWidth={1.5}
    />
  );
}

function getSkillKindLabel(skill: SkillSuggestion): string {
  if (skill.source === "plugin") {
    return skill.pluginName ?? "Plugin";
  }
  if (
    skill.source === "team" &&
    (skill.name === "team" || skill.name === "team-plan")
  ) {
    return "Team mode";
  }
  if (skill.source === "team") {
    return "Subagent";
  }
  return "Skill";
}

interface SelectedSkillChipProps {
  skill: SkillSuggestion;
  onRemove: () => void;
  onPreview: () => void;
}

function SelectedSkillChip({
  skill,
  onRemove,
  onPreview,
}: SelectedSkillChipProps) {
  const kindLabel = getSkillKindLabel(skill);

  return (
    <div className="group relative min-w-0 max-w-full p-1">
      <button
        type="button"
        onClick={onPreview}
        className={cn(
          "flex max-w-[260px] items-center gap-2 rounded-lg border border-border/60 bg-muted/60 px-3 py-2",
          "text-left leading-tight text-foreground",
          "transition-colors duration-150 hover:border-foreground/20 hover:bg-muted",
        )}
      >
        <SkillSourceIcon source={skill.source} name={skill.name} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-xs font-medium">
              /{skill.name}
            </span>
            <span className="shrink-0 rounded border border-border/70 bg-background/70 px-1 py-0 font-mono text-[10px] text-muted-foreground">
              {kindLabel}
            </span>
          </div>
          <span className="truncate text-[11px] text-muted-foreground">
            {skill.description}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-neutral-300 opacity-0 transition-opacity hover:bg-neutral-600 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`Remove /${skill.name}`}
      >
        <X className="h-3 w-3" strokeWidth={1.5} />
      </button>
    </div>
  );
}

interface SkillPreviewDialogProps {
  skill: SkillSuggestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SkillPreviewDialog({
  skill,
  open,
  onOpenChange,
}: SkillPreviewDialogProps) {
  if (!skill) return null;

  const kindLabel = getSkillKindLabel(skill);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <SkillSourceIcon source={skill.source} name={skill.name} />
            <span>/{skill.name}</span>
            <span className="rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
              {kindLabel}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview the selected skill or command details.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60 bg-muted/40 p-4">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {skill.description}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SelectedSkillsPreviewProps {
  skills: SkillSuggestion[];
  onRemove: (name: string) => void;
  className?: string;
}

export function SelectedSkillsPreview({
  skills,
  onRemove,
  className,
}: SelectedSkillsPreviewProps) {
  const [previewSkill, setPreviewSkill] = useState<SkillSuggestion | null>(
    null,
  );

  if (skills.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          "flex max-h-[124px] min-w-0 flex-wrap gap-1 overflow-y-auto",
          className,
        )}
      >
        {skills.map((skill) => (
          <SelectedSkillChip
            key={skill.name}
            skill={skill}
            onRemove={() => onRemove(skill.name)}
            onPreview={() => setPreviewSkill(skill)}
          />
        ))}
      </div>
      <SkillPreviewDialog
        skill={previewSkill}
        open={previewSkill !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewSkill(null);
        }}
      />
    </>
  );
}
