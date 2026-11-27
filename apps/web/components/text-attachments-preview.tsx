"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";
import type { TextAttachment } from "@/lib/text-attachment-utils";
import { formatByteSize } from "@/lib/text-attachment-utils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TextAttachmentChipProps {
  attachment: TextAttachment;
  onRemove: () => void;
  onPreview: () => void;
}

function TextAttachmentChip({
  attachment,
  onRemove,
  onPreview,
}: TextAttachmentChipProps) {
  const meta = `${attachment.lineCount} lines`;

  return (
    <div className="group relative shrink-0 max-w-[260px]">
      <button
        type="button"
        onClick={onPreview}
        title={`${attachment.filename} (${attachment.lineCount} lines · ${formatByteSize(attachment.byteSize)})`}
        className={cn(
          "flex h-[30px] max-w-[260px] items-center gap-1.5 rounded-full bg-muted/80 pl-2.5 pr-3",
          "text-left text-[12.5px] leading-none text-foreground",
          "transition-colors hover:bg-muted",
        )}
      >
        <FileText
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.6}
        />
        <span className="min-w-0 truncate font-medium">
          {attachment.filename}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {meta}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -right-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full border border-background bg-foreground text-background shadow-xs transition-opacity hover:opacity-90"
        aria-label={`Remove ${attachment.filename}`}
      >
        <X className="size-3" strokeWidth={2} />
      </button>
    </div>
  );
}

interface TextAttachmentPreviewDialogProps {
  attachment: TextAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function TextAttachmentPreviewDialog({
  attachment,
  open,
  onOpenChange,
}: TextAttachmentPreviewDialogProps) {
  if (!attachment) return null;

  const meta = `${attachment.lineCount} lines · ${formatByteSize(attachment.byteSize)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{attachment.filename}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {meta}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview the attached text file content.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
            {attachment.content}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TextAttachmentsPreviewProps {
  attachments: TextAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

export function TextAttachmentsPreview({
  attachments,
  onRemove,
  className,
}: TextAttachmentsPreviewProps) {
  const [previewAttachment, setPreviewAttachment] =
    useState<TextAttachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className={cn("flex min-w-0 flex-wrap gap-1", className)}>
        {attachments.map((attachment) => (
          <TextAttachmentChip
            key={attachment.id}
            attachment={attachment}
            onRemove={() => onRemove(attachment.id)}
            onPreview={() => setPreviewAttachment(attachment)}
          />
        ))}
      </div>
      <TextAttachmentPreviewDialog
        attachment={previewAttachment}
        open={previewAttachment !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null);
        }}
      />
    </>
  );
}
