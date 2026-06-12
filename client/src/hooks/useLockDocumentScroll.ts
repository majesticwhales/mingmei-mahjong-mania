import { useEffect } from "react";

/**
 * Pins the document while a full-screen surface (e.g. the game map) is
 * mounted. Mobile Safari can otherwise rubber-band the page when bottom
 * sheets, modals, or pinch-zoom interactions run, which exposes the body
 * background as a scrollable white strip and shifts fixed chrome upward.
 */
export function useLockDocumentScroll(active = true) {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    root.classList.add("scroll-locked");

    const resetScroll = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    resetScroll();
    window.addEventListener("scroll", resetScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", resetScroll);
    window.visualViewport?.addEventListener("scroll", resetScroll);

    return () => {
      root.classList.remove("scroll-locked");
      window.removeEventListener("scroll", resetScroll);
      window.visualViewport?.removeEventListener("resize", resetScroll);
      window.visualViewport?.removeEventListener("scroll", resetScroll);
      resetScroll();
    };
  }, [active]);
}
