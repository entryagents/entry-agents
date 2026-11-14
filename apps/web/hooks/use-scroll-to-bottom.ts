import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const AT_BOTTOM_THRESHOLD_PX = 48;

export interface UseScrollToBottomOptions {
  /**
   * Optional chat/route identifier. Whenever it changes (or on mount),
   * the container re-pins to the bottom so reloading or entering a chat
   * always lands on the latest messages instead of starting near the top.
   */
  chatId?: string;
}

export function useScrollToBottom<T extends HTMLElement>(
  options?: UseScrollToBottomOptions,
) {
  const chatId = options?.chatId;
  const containerRef = useRef<T>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const touchStartYRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const userUpwardIntentRef = useRef(false);
  const rafSnapIdRef = useRef<number | null>(null);

  const setSticky = useCallback((next: boolean) => {
    if (isAtBottomRef.current !== next) {
      isAtBottomRef.current = next;
      setIsAtBottom(next);
    }
  }, []);

  const snapNow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    lastScrollTopRef.current = container.scrollTop;
  }, []);

  const scheduleSnapIfSticky = useCallback(() => {
    if (!isAtBottomRef.current || userUpwardIntentRef.current) return;
    if (rafSnapIdRef.current !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      snapNow();
      return;
    }
    rafSnapIdRef.current = requestAnimationFrame(() => {
      rafSnapIdRef.current = null;
      if (isAtBottomRef.current && !userUpwardIntentRef.current) {
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
    if (!isAtBottomRef.current || userUpwardIntentRef.current) return;
    snapNow();
  }, [snapNow]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const prevScrollTop = lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;

    const atBottom =
      scrollHeight - scrollTop - clientHeight < AT_BOTTOM_THRESHOLD_PX;

    if (atBottom) {
      userUpwardIntentRef.current = false;
      setSticky(true);
      return;
    }

    // Only unpin when the user actively scrolled UP (or expressed upward
    // wheel/touch/keyboard intent). Async content growth (markdown blocks,
    // code syntax highlighting, tool cards, hydration) increases scrollHeight
    // before ResizeObserver snaps scrollTop; ignore scroll-height growth alone.
    const movedUpward = scrollTop < prevScrollTop - 2;
    if (userUpwardIntentRef.current || movedUpward) {
      setSticky(false);
    } else if (isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
    }
  }, [setSticky]);

  // Re-pin & snap immediately before paint on mount or chatId switch.
  useLayoutEffect(() => {
    userUpwardIntentRef.current = false;
    setSticky(true);
    snapNow();

    if (typeof requestAnimationFrame === "function") {
      const id1 = requestAnimationFrame(() => {
        if (isAtBottomRef.current && !userUpwardIntentRef.current) {
          snapNow();
        }
        requestAnimationFrame(() => {
          if (isAtBottomRef.current && !userUpwardIntentRef.current) {
            snapNow();
          }
        });
      });
      return () => cancelAnimationFrame(id1);
    }
  }, [chatId, setSticky, snapNow]);

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
