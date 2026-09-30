"use client";
import type { ComponentProps } from "react";
import { Switch as RapSwitch } from "@rapui/react";

/** rapui Switch with Russian track labels (the library defaults to "on"/"off"). */
export function Switch(props: ComponentProps<typeof RapSwitch>) {
  return <RapSwitch onText="да" offText="нет" {...props} />;
}
