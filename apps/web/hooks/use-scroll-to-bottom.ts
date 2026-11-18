import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const AT_BOTTOM_THRESHOLD_PX = 48;
const MAX_CACHED_CHAT_SCROLL_ENTRIES = 50;

interface CachedChatScrollState {
  scrollTop: number;
  isAtBottom: boolean;
}

const chatScrollStateCache = new Map<string, CachedChatScrollState>();

function getCachedScrollState(
  chatId: string | undefined,
): CachedChatScrollState | undefined {
  if (!chatId) return undefined;
  return chatScrollStateCache.get(chatId);
}

function setCachedScrollState(
  chatId: string | undefined,
  next: CachedChatScrollState,
): void {
  if (!chatId) return;
  if (chatScrollStateCache.has(chatId)) {
    chatScrollStateCache.delete(chatId);
  }
  chatScrollStateCache.set(chatId, next);
  if (chatScrollStateCache.size > MAX_CACHED_CHAT_SCROLL_ENTRIES) {
    const oldestKey = chatScrollStateCache.keys().next().value;
    if (oldestKey !== undefined) {
      chatScrollStateCache.delete(oldestKey);
    }
  }
}

export interface UseScrollToBottomOptions {
  /**
   * Optional chat/route identifier. Whenever it changes (or on mount),
   * restores a previously recorded scroll position for that chat or lands at
   * the bottom for newly opened chats.
   */
  chatId?: string;
  /**
   * Whether the scroll container is currently visible (`display !== none`).
   * Preserves scroll position and sticky state across temporary tab hides
   * (e.g. file viewer, diff viewer, or subagent inspect views).
   */
  isVisible?: boolean;
}

export function useScrollToBottom<T extends HTMLElement>(
  options?: UseScrollToBottomOptions,
) {
  const chatId = options?.chatId;
  const isVisible = options?.isVisible ?? true;
  const initialCached = getCachedScrollState(chatId);
  const initialAtBottom = initialCached ? initialCached.isAtBottom : true;

  const containerRef = useRef<T>(null);
  const [isAtBottom, setIsAtBottom] = useState(initialAtBottom);
  const isAtBottomRef = useRef(initialAtBottom);
  const isVisibleRef = useRef(isVisible);
  const prevVisibleRef = useRef(isVisible);
  const prevChatIdRef = useRef<string | undefined>(undefined);
  const touchStartYRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(initialCached?.scrollTop ?? 0);
  const lastScrollHeightRef = useRef(0);
  const savedScrollTopRef = useRef<number | null>(
    initialCached ? initialCached.scrollTop : null,
  );
  const userUpwardIntentRef = useRef(!initialAtBottom);
  const rafSnapIdRef = useRef<number | null>(null);

  isVisibleRef.current = isVisible;

  const setSticky = useCallback((next: boolean) => {
    if (isAtBottomRef.current !== next) {
      isAtBottomRef.current = next;
      setIsAtBottom(next);
    }
  }, []);

  const snapNow = useCallback(() => {
    const container = containerRef.current;
    if (!container || !isVisibleRef.current || container.clientHeight === 0) {
      return;
    }
    container.scrollTop = container.scrollHeight;
    lastScrollTopRef.current = container.scrollTop;
    lastScrollHeightRef.current = container.scrollHeight;
    savedScrollTopRef.current = container.scrollTop;
    setCachedScrollState(chatId, {
      scrollTop: container.scrollTop,
      isAtBottom: true,
    });
  }, [chatId]);

  const scheduleSnapIfSticky = useCallback(() => {
    if (
      !isVisibleRef.current ||
      !isAtBottomRef.current ||
      userUpwardIntentRef.current
    ) {
      return;
    }
    if (rafSnapIdRef.current !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      snapNow();
      return;
    }
    rafSnapIdRef.current = requestAnimationFrame(() => {
      rafSnapIdRef.current = null;
      if (
        isVisibleRef.current &&
        isAtBottomRef.current &&
        !userUpwardIntentRef.current
      ) {
        snapNow();
      }
    });
  }, [snapNow]);

  const scrollToBottom = useCallback(() => {
    userUpwardIntentRef.current = false;
    setSticky(true);
    snapNow();
  }, [setSticky, snapNow]);

  const scrollIfAtBottom = useCallback(() => {
    if (
      !isVisibleRef.current ||
      !isAtBottomRef.current ||
      userUpwardIntentRef.current
    ) {
      return;
    }
    snapNow();
  }, [snapNow]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !isVisibleRef.current || container.clientHeight === 0) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = container;
    const prevScrollTop = lastScrollTopRef.current;
    const prevScrollHeight = lastScrollHeightRef.current;
    lastScrollTopRef.current = scrollTop;
    lastScrollHeightRef.current = scrollHeight;
    savedScrollTopRef.current = scrollTop;

    const atBottom =
      scrollHeight - scrollTop - clientHeight < AT_BOTTOM_THRESHOLD_PX;

    if (atBottom) {
      userUpwardIntentRef.current = false;
      setSticky(true);
      setCachedScrollState(chatId, { scrollTop, isAtBottom: true });
      return;
    }

    // Only unpin when the user actively scrolled UP (or expressed upward
    // wheel/touch/keyboard intent). Ignore scrollTop clamping caused when
    // collapsible groups shrink scrollHeight on turn completion, as well as
    // async content growth alone.
    const scrollHeightShrank = scrollHeight < prevScrollHeight;
    const movedUpward = !scrollHeightShrank && scrollTop < prevScrollTop - 2;
    if (userUpwardIntentRef.current || movedUpward) {
      setSticky(false);
      setCachedScrollState(chatId, { scrollTop, isAtBottom: false });
    } else if (isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      lastScrollHeightRef.current = container.scrollHeight;
      savedScrollTopRef.current = container.scrollTop;
      setCachedScrollState(chatId, {
        scrollTop: container.scrollTop,
        isAtBottom: true,
      });
    } else {
      setCachedScrollState(chatId, { scrollTop, isAtBottom: false });
    }
  }, [chatId, setSticky]);

  // Restore saved scroll offset when returning from secondary views or remounting
  // a previously visited chat; snap fresh chats to the bottom.
  useLayoutEffect(() => {
    const chatChanged = prevChatIdRef.current !== chatId;
    const becameVisible = !prevVisibleRef.current && isVisible;
    prevChatIdRef.current = chatId;
    prevVisibleRef.current = isVisible;

    if (!isVisible) {
      return;
    }

    const cached = chatChanged ? getCachedScrollState(chatId) : undefined;
    if (chatChanged) {
      lastScrollHeightRef.current = containerRef.current?.scrollHeight ?? 0;
      if (cached) {
        savedScrollTopRef.current = cached.scrollTop;
        lastScrollTopRef.current = cached.scrollTop;
        userUpwardIntentRef.current = !cached.isAtBottom;
        setSticky(cached.isAtBottom);
      } else {
        savedScrollTopRef.current = null;
        lastScrollTopRef.current = 0;
        userUpwardIntentRef.current = false;
        setSticky(true);
      }
    }

    const restoreOrSnap = () => {
      const container = containerRef.current;
      if (!container || !isVisibleRef.current || container.clientHeight === 0) {
        return;
      }
      if (isAtBottomRef.current || (chatChanged && !cached)) {
        snapNow();
      } else if (
        (becameVisible || (chatChanged && cached !== undefined)) &&
        savedScrollTopRef.current !== null
      ) {
        container.scrollTop = savedScrollTopRef.current;
        lastScrollTopRef.current = container.scrollTop;
        lastScrollHeightRef.current = container.scrollHeight;
      }
    };

    restoreOrSnap();

    if (typeof requestAnimationFrame === "function") {
      let id2 = 0;
      const id1 = requestAnimationFrame(() => {
        restoreOrSnap();
        id2 = requestAnimationFrame(() => {
          restoreOrSnap();
        });
      });
      return () => {
        cancelAnimationFrame(id1);
        if (id2) cancelAnimationFrame(id2);
      };
    }
  }, [chatId, isVisible, setSticky, snapNow]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        userUpwardIntentRef.current = true;
        setSticky(false);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        touchStartYRef.current = event.touches[0].clientY;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && touchStartYRef.current !== null) {
        // Finger moving down means user is scrolling up to older messages.
        if (event.touches[0].clientY - touchStartYRef.current > 6) {
          userUpwardIntentRef.current = true;
          setSticky(false);
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "ArrowUp" ||
        event.key === "PageUp" ||
        event.key === "Home"
      ) {
        userUpwardIntentRef.current = true;
        setSticky(false);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("keydown", handleKeyDown, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      scheduleSnapIfSticky();
    });

    resizeObserver.observe(container);
    if (container.firstElementChild) {
      resizeObserver.observe(container.firstElementChild);
    }

    const mutationObserver = new MutationObserver(() => {
      scheduleSnapIfSticky();
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("keydown", handleKeyDown);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (
        rafSnapIdRef.current !== null &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(rafSnapIdRef.current);
        rafSnapIdRef.current = null;
      }
    };
  }, [handleScroll, scheduleSnapIfSticky, setSticky]);

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
    scrollIfAtBottom,
  };
}
