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
    <div className="group relative shrink-0 max-w-[260px]">
      <button
        type="button"
        onClick={onPreview}
        title={
          skill.description
            ? `/${skill.name} — ${skill.description}`
            : `/${skill.name}`
        }
        className={cn(
          "flex h-[30px] max-w-[260px] items-center gap-1.5 rounded-full bg-muted/80 pl-2.5 pr-3",
          "text-left text-[12.5px] leading-none text-foreground",
          "transition-colors duration-150 hover:bg-muted",
        )}
      >
        <SkillSourceIcon source={skill.source} name={skill.name} />
        <span className="min-w-0 truncate font-mono text-[12px] font-medium">
          /{skill.name}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {kindLabel}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-foreground/85 text-background opacity-0 transition-opacity hover:bg-foreground focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`Remove /${skill.name}`}
      >
        <X className="size-2.5" strokeWidth={2} />
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
