"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { VideoPlayer as RapVideoPlayer } from "@rapui/react";

/**
 * rapui VideoPlayer (0.1.0) decides during render whether to show its
 * picture-in-picture button from `document.pictureInPictureEnabled`, which
 * does not exist on the server → a hydration mismatch in App Router.
 * Local workaround instead of patching the library: show the poster frame
 * on the server and mount the player after hydration.
 */
export function VideoPlayer(props: ComponentProps<typeof RapVideoPlayer>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (mounted) return <RapVideoPlayer {...props} />;
  return (
    <div className={props.className} style={{ aspectRatio: props.aspect ?? "16 / 9", position: "relative" }}>
      {props.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.poster} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );
}
