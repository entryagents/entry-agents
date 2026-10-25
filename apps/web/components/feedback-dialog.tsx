"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bug, Sparkles, MessageSquare, Loader2, Send } from "lucide-react";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  { id: "bug", label: "Bug Report", icon: Bug },
  { id: "feature", label: "Feature Request", icon: Sparkles },
  { id: "general", label: "General Feedback", icon: MessageSquare },
] as const;

const SENTIMENTS = [
  { id: "love", emoji: "😍", label: "Loved it" },
  { id: "good", emoji: "👍", label: "Good" },
  { id: "neutral", emoji: "😐", label: "Neutral" },
  { id: "bad", emoji: "👎", label: "Needs work" },
] as const;

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [category, setCategory] = useState<"bug" | "feature" | "general">(
    "general",
  );
  const [sentiment, setSentiment] = useState<
    "love" | "good" | "neutral" | "bad"
  >("good");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a feedback message.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          sentiment,
          title: title.trim() || null,
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit feedback");
      }

      toast.success("Feedback submitted!", {
        description: "Thank you for helping us improve Entry Agents.",
      });
      setTitle("");
      setMessage("");
      onOpenChange(false);
    } catch {
      toast.error("Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Send Feedback
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Have a suggestion, noticed a bug, or want a feature? Let the
            founders know directly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Category Chips */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Feedback Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const isSelected = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary shadow-2xs font-semibold"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sentiment Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              How has your experience been?
            </label>
            <div className="flex items-center justify-between gap-2">
              {SENTIMENTS.map((s) => {
                const isSelected = sentiment === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSentiment(s.id)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-2xs"
                        : "border-border/60 bg-muted/20 hover:bg-muted"
                    }`}
                  >
                    <span className="text-lg leading-none">{s.emoji}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title input */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Subject (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sandbox reconnect issue or Dark mode styling"
              maxLength={120}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Message textarea */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Details &amp; Feedback *
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what happened, what you liked, or what you would love to see added..."
              className="w-full rounded-lg border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send Feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
