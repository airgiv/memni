/** Browser-safe shapes: no storage keys, no provider internals. Types are shared with the client. */
import type { DraftView } from "./services/drafts";
import { publicJob } from "./services/jobs";
import { publicPhoto } from "./http";
import type { Person, Photo, Preview } from "../domain/types";

export function presentPerson(p: Person & { photos: Photo[] }) {
  return { id: p.id, name: p.name, saved: p.saved, mainPhotoId: p.mainPhotoId ?? null, createdAt: p.createdAt, photos: p.photos.map(publicPhoto) };
}
export type PersonDTO = ReturnType<typeof presentPerson>;

export function presentPreview(p: Preview, currentFp: string) {
  return {
    id: p.id,
    seq: p.seq,
    status: p.status,
    isDemo: p.isDemo,
    paid: Boolean(p.paid),
    /** made for the current photos and settings — only these can be approved for the video */
    actual: p.fingerprint === currentFp,
    /** stable error code (preview_failed | preview_rejected) */
    errorKey: p.error && /^[a-z_]+$/.test(p.error) ? p.error : p.error ? "preview_failed" : null,
    url: p.storageKey && p.status === "ready" ? `/api/files/preview/${p.id}` : null,
    createdAt: p.createdAt,
  };
}
export type PreviewDTO = ReturnType<typeof presentPreview>;

export function presentDraft(v: DraftView) {
  return {
    id: v.draft.id,
    memeId: v.draft.templateId,
    version: v.draft.version,
    maxPhotos: v.maxPhotos,
    roles: v.roles.map((r) => ({ roleId: r.roleId, person: r.person ? presentPerson(r.person) : null, look: r.look, ready: r.ready })),
    ready: v.ready,
    previews: v.previews.map((p) => presentPreview(p, v.inputsFingerprint)),
    selectedPreviewId: v.selectedPreviewId,
    billing: v.billing,
    quotes: v.quotes,
    video: {
      preview: v.video.preview,
      direct: v.video.direct,
      scope: v.video.scope,
      isDemo: v.video.isDemo,
      lastJob: v.video.lastJob ? publicJob(v.video.lastJob) : null,
    },
  };
}
export type DraftDTO = ReturnType<typeof presentDraft>;
export type RoleDTO = DraftDTO["roles"][number];
