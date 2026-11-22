"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOpenFile } from "./open-file-context";

function splitPath(filePath: string): { dir: string; fileName: string } {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) {
    return { dir: "", fileName: normalized };
  }
  return {
    dir: normalized.slice(0, idx + 1),
    fileName: normalized.slice(idx + 1) || normalized,
  };
}

export function FileNamePill({
  filePath,
  fullPath,
  error = false,
}: {
  filePath: string;
  fullPath?: string;
  error?: boolean;
}) {
  const onOpenFile = useOpenFile();
  const { dir, fileName } = splitPath(filePath);
  const tooltipPath = fullPath ?? filePath;
  const showTooltip = tooltipPath !== fileName;
  const isClickable = onOpenFile !== null;

  const handleClick = (e: React.MouseEvent) => {
    if (!onOpenFile) return;
    e.stopPropagation(); // Don't trigger parent tool call expand
    onOpenFile(filePath);
  };

  const labelContent = (
    <>
      {dir ? (
        <span
          className={cn(
            "truncate",
            error ? "text-red-400/70" : "text-muted-foreground/70",
          )}
        >
          {dir}
        </span>
      ) : null}
      <span
        className={cn(
          "shrink-0",
          error ? "text-red-400" : "text-foreground/90",
        )}
      >
        {fileName}
      </span>
    </>
  );

  const label = isClickable ? (
    <button
      type="button"
      onClick={handleClick}
      title={showTooltip ? undefined : `Open ${fileName}`}
      className={cn(
        "inline-flex max-w-full min-w-0 cursor-pointer items-baseline text-[12.5px] font-normal leading-none transition-colors hover:underline underline-offset-2",
        error ? "text-red-400" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {labelContent}
    </button>
  ) : (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-baseline text-[12.5px] font-normal leading-none",
        error ? "text-red-400" : "text-muted-foreground",
      )}
    >
      {labelContent}
    </span>
  );

  if (!showTooltip) return label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent side="top">
        <span className="font-mono text-xs">{tooltipPath}</span>
      </TooltipContent>
    </Tooltip>
  );
}
