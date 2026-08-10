"use client";

import { useState, useEffect } from "react";

// True only on localhost. Used to hide local-only features (e.g. Test Runner,
// which needs Python+pytest+playwright that don't exist on Vercel).
export function useIsLocal() {
  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => {
    setIsLocal(window.location.hostname === "localhost");
  }, []);
  return isLocal;
}
