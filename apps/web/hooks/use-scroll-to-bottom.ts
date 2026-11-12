import { useCallback, useEffect, useRef, useState } from "react";

const AT_BOTTOM_THRESHOLD_PX = 48;

export function useScrollToBottom<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const touchStartYRef = useRef<number | null>(null);

  const setSticky = useCallback((next: boolean) => {
    if (isAtBottomRef.current !== next) {
      isAtBottomRef.current = next;
      setIsAtBottom(next);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setSticky(true);
    container.scrollTop = container.scrollHeight;
  }, [setSticky]);

  const scrollIfAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container || !isAtBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const atBottom =
      scrollHeight - scrollTop - clientHeight < AT_BOTTOM_THRESHOLD_PX;
    setSticky(atBottom);
  }, [setSticky]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
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
          setSticky(false);
        }
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });

    // Scroll to bottom on initial mount
    container.scrollTop = container.scrollHeight;
    handleScroll();

    const resizeObserver = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });

    resizeObserver.observe(container);
    if (container.firstElementChild) {
      resizeObserver.observe(container.firstElementChild);
    }

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      resizeObserver.disconnect();
    };
  }, [handleScroll, setSticky]);

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
    scrollIfAtBottom,
  };
}
