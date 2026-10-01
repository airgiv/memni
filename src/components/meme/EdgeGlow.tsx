"use client";
import { useEffect } from "react";
import { usePageVisible } from "@/client/hooks";

/** Soft light travelling along the viewport edge while something is being generated. */
export function EdgeGlow({ on }: { on: boolean }) {
  const visible = usePageVisible();
  useEffect(() => {
    document.documentElement.dataset.hidden = visible ? "false" : "true";
  }, [visible]);
  return <div aria-hidden className="edge-glow" data-on={on ? "true" : "false"} />;
}
