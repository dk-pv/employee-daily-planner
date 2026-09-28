"use client";

import { useEffect } from "react";

/**
 * If the browser restores a page from its back/forward cache (e.g. Back after logout),
 * reload it so the server re-checks the session instead of showing a stale snapshot.
 */
export function BackForwardGuard() {
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return null;
}
