"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Ported 1:1 from Leonxlnx/sable `src/features/timeline/fold.ts`.
 * Remembers what the reader has opened in the conversation (a turn's work, a run of steps),
 * keyed by session/message and item id; each key notifies only its own readers so opening
 * one fold re-renders nothing else.
 */
const state = new Map<string, boolean>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

export function getFold(key: string): boolean | undefined {
  return state.get(key);
}

export function setFold(key: string, open: boolean): void {
  if (state.get(key) === open) return;
  state.set(key, open);
  emit(key);
}

function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      listeners.delete(key);
    }
  };
}

/** A remembered open/closed flag. `fallback` applies until the reader chooses. */
export function useFold(
  key: string,
  fallback = false,
): [boolean, (open: boolean) => void] {
  const sub = useCallback(
    (listener: () => void) => subscribe(key, listener),
    [key],
  );
  const value = useSyncExternalStore(
    sub,
    () => state.get(key),
    () => undefined,
  );
  const set = useCallback((open: boolean) => setFold(key, open), [key]);
  return [value ?? fallback, set];
}

export const foldKey = (scope: string, id: string, part = "work") =>
  `${scope}\u0000${part}\u0000${id}`;
