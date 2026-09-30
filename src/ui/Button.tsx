"use client";
import { forwardRef, type ComponentProps } from "react";
import { Button as RapButton } from "@rapui/react";

/**
 * rapui Button with the label held still: `roll={false}` is the library's own
 * switch for the hover letter-roll (default true in @rapui/react 0.1.0).
 * The background fill still floods in on hover; `magnetic` stays off (default),
 * so the pill never moves or changes size. Focus ring, loading and disabled
 * states are the library's.
 */
export const Button = forwardRef<HTMLButtonElement, ComponentProps<typeof RapButton>>(function Button(props, ref) {
  return <RapButton ref={ref} roll={false} {...props} />;
});
