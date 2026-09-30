/** Browser-safe shapes: no storage keys, no provider internals. Types are shared with the client. */
import type { DraftView } from "./services/drafts";
import { publicJob } from "./services/jobs";
import { publicPhoto, publicPreview } from "./http";
import type { Person, Photo } from "../domain/types";

export function presentPerson(p: Person & { photos: Photo[] }) {
  return {
    id: p.id,
    name: p.name,
    saved: p.saved,
    mainPhotoId: p.mainPhotoId ?? null,
    appearanceNote: p.appearanceNote ?? "",
    createdAt: p.createdAt,
    photos: p.photos.map(publicPhoto),
  };
}
export type PersonDTO = ReturnType<typeof presentPerson>;

export function presentDraft(v: DraftView) {
  return {
    id: v.draft.id,
    templateId: v.draft.templateId,
    templateVersion: v.draft.templateVersion,
    version: v.draft.version,
    sceneOptionId: v.draft.scene.optionId,
    roles: v.roles.map((r) => ({
      roleId: r.roleId,
      person: r.person ? presentPerson(r.person) : null,
      look: r.look,
      fingerprint: r.fingerprint,
      previews: r.previews.map(publicPreview),
      selectedPreviewId: r.selectedPreviewId,
      confirmedPreviewId: r.confirmedPreviewId,
      photosReady: r.photosReady,
    })),
    scene: {
      fingerprint: v.scene.fingerprint,
      previews: v.scene.previews.map(publicPreview),
      selectedPreviewId: v.scene.selectedPreviewId,
      confirmedPreviewId: v.scene.confirmedPreviewId,
      canGenerate: v.scene.canGenerate,
    },
    video: {
      canStart: v.video.canStart,
      plan: v.video.plan,
      isDemo: v.video.isDemo,
      lastJob: v.video.lastJob ? publicJob(v.video.lastJob) : null,
    },
    quota: v.quota,
    cleared: v.cleared,
  };
}
export type DraftDTO = ReturnType<typeof presentDraft>;
export type RoleDTO = DraftDTO["roles"][number];
