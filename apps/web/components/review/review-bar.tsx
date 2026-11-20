"use client";

import "./review.css";
import { ArrowUp, ChevronUp, MessageSquare } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useState } from "react";
import { useReview } from "@/app/sessions/[sessionId]/chats/[chatId]/review-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { rangeLabel, reviewMessage } from "@/lib/review/model";

const rise = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: 0.14, ease: [0.5, 0, 0.9, 0.4] as const },
  },
  transition: { type: "spring" as const, stiffness: 460, damping: 36 },
};

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstLine = (t: string) =>
  t
    .split("\n")
    .find((l) => l.trim())
    ?.trim() ?? "";

function splitPath(p: string): [string, string] {
  const i = p.lastIndexOf("/");
  return i < 0 ? ["", p] : [p.slice(0, i + 1), p.slice(i + 1)];
}

interface ReviewBarProps {
  /** Optional current composer text to prepend as the review lead. */
  composerLead?: string;
  /** Sends the formatted review as one message and clears the composer if needed. */
  onSendReview: (formattedMessage: string) => Promise<void> | void;
  disabled?: boolean;
}

/**
 * Pending diff review bar above the composer, ported 1:1 from Sable's `ReviewBar.tsx`.
 * Shows `"N comments"` dropdown to jump to each comment, Discard, and Send review.
 */
export const ReviewBar = memo(function ReviewBar({
  composerLead = "",
  onSendReview,
  disabled = false,
}: ReviewBarProps) {
  const { orderedComments, clearReview, jumpToComment } = useReview();
  const count = orderedComments.length;
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const label = count === 1 ? "comment" : "comments";

  const handleSend = async () => {
    if (sending || disabled || count === 0) return;
    setSending(true);
    try {
      const msg = reviewMessage(orderedComments, composerLead);
      await onSendReview(msg);
      clearReview();
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div key="review" className="mb-2" {...rise}>
          <section className="rv-bar" aria-label="Pending review">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rv-count"
                  aria-label={`${count} review ${label}, show the list`}
                >
                  <MessageSquare
                    size={14}
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                  <span>
                    {count} {label}
                  </span>
                  <ChevronUp
                    size={12}
                    strokeWidth={2}
                    className="rv-count-caret"
                    aria-hidden="true"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-[340px] max-h-64 overflow-y-auto p-1"
              >
                {orderedComments.map((c) => {
                  const [dir, base] = splitPath(c.path);
                  const range = rangeLabel(c.lines);
                  return (
                    <DropdownMenuItem
                      key={c.id}
                      className="rv-item"
                      onSelect={() => jumpToComment(c)}
                    >
                      <span className="rv-item-where">
                        <span className="rv-item-path truncate">
                          {dir && <span className="rv-item-dir">{dir}</span>}
                          {base}
                        </span>
                        {range && (
                          <span className="rv-item-range">{upper(range)}</span>
                        )}
                      </span>
                      <span className="rv-item-text truncate">
                        {firstLine(c.text)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-1.5">
              {count === 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={clearReview}
                >
                  Discard
                </Button>
              ) : (
                <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                    >
                      Discard
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={8}
                    className="w-56 p-3"
                  >
                    <div className="text-xs font-medium text-foreground mb-2.5">
                      Discard {count} comments?
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setConfirmOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          setConfirmOpen(false);
                          clearReview();
                        }}
                      >
                        Discard
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                disabled={sending || disabled}
                onClick={() => void handleSend()}
              >
                <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
                Send review
              </Button>
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
