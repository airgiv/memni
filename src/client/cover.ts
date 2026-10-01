/**
 * object-fit: cover with a focal point. CSS object-position aligns
 * percentages, not points, so we compute the pixel offset that keeps the
 * focal point as close to the centre as the crop allows.
 */
export interface CoverBox {
  /** displayed media size */
  w: number;
  h: number;
  /** offset of the media's top-left corner inside the container (≤ 0) */
  x: number;
  y: number;
}

export function coverBox(container: { w: number; h: number }, media: { w: number; h: number }, focal: { x: number; y: number }): CoverBox {
  if (!container.w || !container.h) return { w: 0, h: 0, x: 0, y: 0 };
  const s = Math.max(container.w / media.w, container.h / media.h);
  const w = media.w * s;
  const h = media.h * s;
  const clamp = (v: number, min: number) => Math.min(0, Math.max(min, v));
  return { w, h, x: clamp(container.w / 2 - focal.x * w, container.w - w), y: clamp(container.h / 2 - focal.y * h, container.h - h) };
}
