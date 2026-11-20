"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  newCommentId,
  orderComments,
  type ReviewComment,
  type ReviewLine,
} from "@/lib/review/model";
import { useGitPanel } from "./git-panel-context";

export interface ReviewDraft {
  path: string;
  side: "additions" | "deletions";
  lineNumber: number;
  lines: ReviewLine[];
}

interface ReviewContextValue {
  comments: ReviewComment[];
  orderedComments: ReviewComment[];
  draft: ReviewDraft | null;
  openDraft: (draft: ReviewDraft) => void;
  closeDraft: () => void;
  addComment: (draft: ReviewDraft, text: string) => void;
  editComment: (id: string, text: string) => void;
  removeComment: (id: string) => void;
  clearReview: () => void;
  jumpToComment: (comment: ReviewComment) => void;
}

const ReviewContext = createContext<ReviewContextValue | undefined>(undefined);

const storageKey = (sessionId: string) => `entry:review:${sessionId}`;

export function ReviewProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const { setGitPanelOpen, setActiveWorkspaceTab, openDiffToFile } =
    useGitPanel();

  const [comments, setComments] = useState<ReviewComment[]>(() => {
    if (typeof window === "undefined" || !sessionId) return [];
    try {
      const raw = localStorage.getItem(storageKey(sessionId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ReviewComment[]) : [];
    } catch {
      return [];
    }
  });

  const [draft, setDraft] = useState<ReviewDraft | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionId) return;
    try {
      if (comments.length === 0) {
        localStorage.removeItem(storageKey(sessionId));
      } else {
        localStorage.setItem(storageKey(sessionId), JSON.stringify(comments));
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [comments, sessionId]);

  const openDraft = useCallback((next: ReviewDraft) => {
    setDraft(next);
  }, []);

  const closeDraft = useCallback(() => {
    setDraft(null);
  }, []);

  const addComment = useCallback((target: ReviewDraft, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || target.lines.length === 0) return;
    const comment: ReviewComment = {
      id: newCommentId(),
      path: target.path,
      side: target.side,
      lineNumber: target.lineNumber,
      lines: target.lines,
      text: trimmed,
      at: Date.now(),
    };
    setComments((prev) => [...prev, comment]);
    setDraft(null);
  }, []);

  const editComment = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setComments((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, text: trimmed } : c)),
    );
  }, []);

  const removeComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearReview = useCallback(() => {
    setComments([]);
    setDraft(null);
  }, []);

  const jumpToComment = useCallback(
    (comment: ReviewComment) => {
      setGitPanelOpen(true);
      setActiveWorkspaceTab("review");
      openDiffToFile(comment.path);
    },
    [setGitPanelOpen, setActiveWorkspaceTab, openDiffToFile],
  );

  const orderedComments = useMemo(() => orderComments(comments), [comments]);

  const value = useMemo<ReviewContextValue>(
    () => ({
      comments,
      orderedComments,
      draft,
      openDraft,
      closeDraft,
      addComment,
      editComment,
      removeComment,
      clearReview,
      jumpToComment,
    }),
    [
      comments,
      orderedComments,
      draft,
      openDraft,
      closeDraft,
      addComment,
      editComment,
      removeComment,
      clearReview,
      jumpToComment,
    ],
  );

  return (
    <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>
  );
}

export function useReview(): ReviewContextValue {
  const ctx = useContext(ReviewContext);
  if (!ctx) {
    throw new Error("useReview must be used inside a ReviewProvider");
  }
  return ctx;
}
