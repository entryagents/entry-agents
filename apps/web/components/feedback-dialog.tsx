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
import {
  Bug,
  Heart,
  Loader2,
  MessageSquare,
  Minus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  { id: "bug", label: "Bug report", icon: Bug },
  { id: "feature", label: "Feature request", icon: Sparkles },
  { id: "general", label: "General", icon: MessageSquare },
] as const;

const SENTIMENTS = [
  { id: "love", icon: Heart, label: "Loved it" },
  { id: "good", icon: ThumbsUp, label: "Good" },
  { id: "neutral", icon: Minus, label: "Neutral" },
  { id: "bad", icon: ThumbsDown, label: "Needs work" },
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

      toast.success("Feedback submitted", {
        description: "Thank you for helping improve Entry.",
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
          <DialogTitle className="text-lg font-medium">
            Send feedback
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Report a bug, request a capability, or share direct feedback with
            the engineering team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-foreground">
              Category
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const isSelected = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" strokeWidth={1.5} />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-foreground">
              Experience
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {SENTIMENTS.map((s) => {
                const Icon = s.icon;
                const isSelected = sentiment === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSentiment(s.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-center transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? "border-foreground bg-muted text-foreground"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4" strokeWidth={1.5} />
                    <span className="text-[11px]">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label
              htmlFor="feedback-subject-input"
              className="text-xs font-medium text-foreground"
            >
              Subject (optional)
            </label>
            <input
              id="feedback-subject-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sandbox reconnect or diff viewer"
              maxLength={120}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="feedback-details-textarea"
              className="text-xs font-medium text-foreground"
            >
              Details
            </label>
            <textarea
              id="feedback-details-textarea"
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what happened or what you would like to see..."
              className="w-full resize-none rounded-lg border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
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
                  <Loader2
                    className="mr-1.5 size-3.5 animate-spin"
                    strokeWidth={1.5}
                  />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3.5" strokeWidth={1.5} />
                  Send feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
