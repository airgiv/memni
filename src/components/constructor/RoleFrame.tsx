"use client";
/**
 * The template's reference frame with its roles marked on it. This is the
 * domain piece rapui does not have; it is built on rapui tokens (radii, tones,
 * easing) and keeps the page's visual language. The current role breathes
 * softly (off under reduced motion / calm); others stay visible but quiet.
 */
import type { ClientTemplate } from "@/lib/templates/client";
import type { RoleDTO } from "@/lib/server/present";
import { TONE_INK, TONE_VAR } from "@/client/tones";

export function RoleFrame({
  template,
  roles,
  activeRoleId,
  onRoleClick,
  imageSrc,
  showRegions = true,
  label,
}: {
  template: ClientTemplate;
  roles: RoleDTO[];
  activeRoleId?: string | null;
  onRoleClick?: (roleId: string) => void;
  imageSrc?: string;
  showRegions?: boolean;
  label?: string;
}) {
  const f = template.media.referenceFrame;
  return (
    <figure className="relative mx-auto w-full overflow-hidden rounded-card bg-ink" style={{ aspectRatio: `${f.width} / ${f.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc ?? f.src} alt={label ?? `Кадр шаблона «${template.title}»`} className="absolute inset-0 size-full object-cover" />
      {showRegions &&
        template.roles.map((role) => {
          const r = role.region;
          const dto = roles.find((x) => x.roleId === role.id);
          const active = role.id === activeRoleId;
          const main = dto?.person?.photos.find((p) => p.id === dto.person?.mainPhotoId) ?? dto?.person?.photos[0];
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onRoleClick?.(role.id)}
              aria-label={`${role.name}${dto?.person ? `: ${dto.person.name}` : ": не назначено"}`}
              aria-pressed={active}
              className={`group absolute rounded-[22px] transition-[opacity,box-shadow] duration-(--rap-dur-fast) ease-rm focus-visible:outline-none ${
                active ? "role-active opacity-100" : activeRoleId ? "opacity-60 hover:opacity-90" : "opacity-90"
              }`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                ["--role-color" as string]: TONE_VAR[role.tone],
                boxShadow: active ? undefined : `inset 0 0 0 2px ${TONE_VAR[role.tone]}`,
              }}
            >
              <span
                className="absolute top-2 left-2 flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-pill py-1 pr-3 pl-1 text-[0.75rem] font-medium shadow-pop sm:text-[0.8125rem]"
                style={{ background: TONE_VAR[role.tone], color: TONE_INK[role.tone] }}
              >
                {main ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={main.url} alt="" className="size-6 rounded-full object-cover" />
                ) : (
                  <span className="grid size-6 place-items-center rounded-full bg-black/15 text-[0.75rem]">?</span>
                )}
                <span className="truncate">{dto?.person?.name ?? role.name}</span>
              </span>
            </button>
          );
        })}
      {template.demoMaterials && !imageSrc && (
        <figcaption className="absolute right-3 bottom-3 rounded-pill bg-black/60 px-3 py-1 text-[0.75rem] text-white">демо-кадр</figcaption>
      )}
    </figure>
  );
}
