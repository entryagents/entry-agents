"use client";

import "./review.css";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ReviewDraft } from "@/app/sessions/[sessionId]/chats/[chatId]/review-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rangeLabel, type ReviewComment } from "@/lib/review/model";

export type DiffAnnotationMetadata =
  | { kind: "comment"; comment: ReviewComment }
  | { kind: "draft"; draft: ReviewDraft };

export function DiffCommentComposer({
  draft,
  onSave,
  onCancel,
}: {
  draft: ReviewDraft;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const range = rangeLabel(draft.lines);

  const submit = () => {
    if (!text.trim()) return;
    onSave(text);
  };

  return (
    <div className="rv-card">
      <div className="rv-card-head">
        <span className="rv-card-range">
          {range ? `Comment on ${range}` : "Add review comment"}
        </span>
      </div>
      <Textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a review comment… (⌘Enter to add)"
        className="min-h-[60px] text-xs resize-y mb-2"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={!text.trim()}
          onClick={submit}
        >
          Add comment
        </Button>
      </div>
    </div>
  );
}

export function DiffCommentCard({
  comment,
  onEdit,
  onRemove,
}: {
  comment: ReviewComment;
  onEdit: (text: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const range = rangeLabel(comment.lines);

  const saveEdit = () => {
    onEdit(text);
    setEditing(false);
  };

  return (
    <div className="rv-card">
      <div className="rv-card-head">
        <span className="rv-card-range">{range ?? "Comment"}</span>
        {!editing && (
          <div className="rv-card-actions">
            <button
              type="button"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => {
                setText(comment.text);
                setEditing(true);
              }}
              aria-label="Edit comment"
            >
              <Pencil size={12} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              onClick={onRemove}
              aria-label="Remove comment"
            >
              <Trash2 size={12} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <>
          <Textarea
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[60px] text-xs resize-y mb-2"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                saveEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={saveEdit}
            >
              Save
            </Button>
          </div>
        </>
      ) : (
        <div className="rv-card-body">{comment.text}</div>
      )}
    </div>
  );
}
