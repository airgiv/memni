"use client";
import { useRef, useState } from "react";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Segmented } from "@/ui/segmented";
import { Spinner } from "@/ui/spinner";
import { api } from "@/client/api";
import type { ClientTemplate } from "@/lib/templates/client";
import type { PersonDTO, RoleDTO } from "@/lib/server/present";
import type { LookSettings } from "@/lib/domain/types";
import type { DraftOp } from "@/lib/server/services/drafts";

const MAX_MB = 12;
const MAX_PHOTOS = 3;
const ACCEPT = "image/jpeg,image/png,image/webp";

function lookValue(l: LookSettings | null) {
  if (!l) return "template";
  return l.clothing === "preset" ? `preset:${l.presetId}` : l.clothing;
}
function lookFromValue(v: string): Partial<LookSettings> {
  return v.startsWith("preset:") ? { clothing: "preset", presetId: v.slice(7) } : { clothing: v as LookSettings["clothing"] };
}

/**
 * The frame IS the screen: the person being replaced fills it, a compact
 * panel sits over the part that has no faces. Nothing is generated here —
 * only photos and the look are collected.
 */
export function ParticipantStep({
  template: t,
  draftId,
  index,
  role,
  savedPeople,
  change,
  reload,
  onNext,
  nextLabel,
}: {
  template: ClientTemplate;
  draftId: string;
  index: number;
  role: RoleDTO;
  savedPeople: PersonDTO[];
  change: (op: DraftOp) => Promise<unknown>;
  reload: () => Promise<unknown>;
  onNext: () => void;
  nextLabel: string;
}) {
  const r = t.roles[index];
  const person = role.person;
  const photos = person?.photos ?? [];
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ key: string; url: string }[]>([]);
  const [dontSave, setDontSave] = useState(false);
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [moreLooks, setMoreLooks] = useState(false);
  const notSaved = person ? !person.saved : dontSave;
  const others = savedPeople.filter((p) => p.saved && p.id !== person?.id && p.photos.length > 0);
  const busy = uploading.length > 0;

  const upload = async (files: File[], replaceId?: string) => {
    const list = files.slice(0, replaceId ? 1 : Math.max(1, MAX_PHOTOS - photos.length));
    const items = list.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, url: URL.createObjectURL(f), file: f }));
    setUploading((u) => [...u, ...items.map(({ key, url }) => ({ key, url }))]);
    for (const it of items) {
      try {
        if (it.file.size > MAX_MB * 1024 * 1024) throw new Error(`Файл больше ${MAX_MB} МБ`);
        const fd = new FormData();
        fd.append("file", it.file);
        fd.append("save", String(!dontSave));
        await api(`/api/drafts/${draftId}/roles/${r.id}/photos`, { method: "POST", body: fd });
        if (replaceId) await api(`/api/photos/${replaceId}`, { method: "DELETE" });
        await reload();
      } catch (e) {
        toast.error((e as Error).message);
      }
      setUploading((u) => u.filter((x) => x.key !== it.key));
      URL.revokeObjectURL(it.url);
    }
  };
  const remove = async (id: string) => {
    try {
      await api(`/api/photos/${id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const toggleSave = async (v: boolean) => {
    if (!person) return setDontSave(v);
    try {
      await api(`/api/people/${person.id}`, { method: "PATCH", json: { saved: !v } });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const look = lookValue(role.look);
  const base = [
    ...(t.look.clothingModes.includes("template") ? [{ value: "template", label: t.look.templateOutfit.label }] : []),
    ...(t.look.clothingModes.includes("photo") ? [{ value: "photo", label: "С фото" }] : []),
  ];
  const presets = t.look.clothingModes.includes("preset") ? t.look.presets.map((p) => ({ value: `preset:${p.id}`, label: p.label })) : [];
  const showPresets = moreLooks || look.startsWith("preset:");
  const f = t.media.referenceFrame;
  const panelSide = r.region.x + r.region.w / 2 < 0.5 ? "md:right-4" : "md:left-4";

  const panel = (
    <div className="flex flex-col gap-3">
      {photos.length === 0 && !busy ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => input.current?.click()} icon={<Plus className="size-4" aria-hidden />} className="max-md:h-12 max-md:flex-1">
            Загрузить фото
          </Button>
          {others.length > 0 && (
            <Button variant="secondary" onClick={() => setPeopleOpen(true)} icon={<Users className="size-4" aria-hidden />} className="max-md:h-12">
              Мои люди
            </Button>
          )}
          <span className="text-[13px] text-white/80">1–3 фото</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ul className="flex gap-2" aria-label="Фото">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenPhoto(p.id)}
                    aria-label={`Фото ${i + 1}: заменить или удалить`}
                    className="block size-12 overflow-hidden rounded-lg border border-white/20 hover:border-white/60 md:size-11"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="size-full object-cover" />
                  </button>
                </li>
              ))}
              {uploading.map((u) => (
                <li key={u.key} className="relative size-12 overflow-hidden rounded-lg md:size-11">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.url} alt="" className="size-full object-cover opacity-50" />
                  <span className="absolute inset-0 grid place-items-center">
                    <Spinner className="size-4" label="Загружаем" />
                  </span>
                </li>
              ))}
              {photos.length + uploading.length < MAX_PHOTOS && (
                <li>
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    aria-label="Добавить фото"
                    className="grid size-12 place-items-center rounded-lg border border-dashed border-white/40 text-white hover:border-white/80 md:size-11"
                  >
                    <Plus className="size-5" aria-hidden />
                  </button>
                </li>
              )}
            </ul>
            {others.length > 0 && (
              <button type="button" onClick={() => setPeopleOpen(true)} className="ml-auto h-9 rounded-md px-2 text-[13px] text-white/80 hover:bg-white/10 hover:text-white">
                Мои люди
              </button>
            )}
          </div>
          {photos.length > 0 && base.length + presets.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Одежда"
                value={look}
                onChange={(v) => void change({ op: "look", roleId: r.id, look: lookFromValue(v) })}
                options={showPresets ? [...base, ...presets] : base}
              />
              {presets.length > 0 && !showPresets && (
                <button type="button" onClick={() => setMoreLooks(true)} className="h-8 rounded-md px-2 text-[13px] text-white/80 hover:bg-white/10 hover:text-white">
                  Ещё
                </button>
              )}
            </div>
          )}
        </>
      )}
      <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-white/80">
        <input type="checkbox" checked={notSaved} onChange={(e) => void toggleSave(e.target.checked)} className="size-4 accent-accent" />
        Не сохранять в «Мои люди»
      </label>
      <div className="hidden justify-end md:flex">
        <Button onClick={onNext} disabled={!role.ready || busy}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* phone: the portrait cutout of this person; desktop: the whole frame with this person picked out */}
      <div className="relative overflow-hidden rounded-xl bg-black md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.cutout.src} alt={`${r.name}: этого человека заменим`} className="aspect-[3/4] max-h-[64dvh] w-full object-cover object-top" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pt-10 pb-3">{panel}</div>
      </div>

      <div className="relative hidden overflow-hidden rounded-xl bg-black md:block" style={{ aspectRatio: `${f.width} / ${f.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.src} alt={`${r.name}: этого человека заменим`} className="absolute inset-0 size-full object-contain" />
        {/* the person being replaced stays bright; the rest is dimmed a little */}
        <div
          aria-hidden
          className="absolute rounded-lg ring-2 ring-accent"
          style={{
            left: `${r.region.x * 100}%`,
            top: `${r.region.y * 100}%`,
            width: `${r.region.w * 100}%`,
            height: `${r.region.h * 100}%`,
            boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.45)",
          }}
        />
        <div className={`absolute bottom-4 w-[min(360px,42%)] rounded-xl bg-black/75 p-3 backdrop-blur-sm ${panelSide}`}>{panel}</div>
      </div>

      <div className="md:hidden">
        <Button size="lg" block onClick={onNext} disabled={!role.ready || busy}>
          {nextLabel}
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        aria-label="Выбрать фото"
        tabIndex={-1}
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && openPhoto) void upload([file], openPhoto);
          e.target.value = "";
          setOpenPhoto(null);
        }}
      />

      <Dialog open={openPhoto !== null} onOpenChange={(v) => !v && setOpenPhoto(null)} title="Фото">
        {openPhoto && (
          <div className="flex flex-col gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.find((p) => p.id === openPhoto)?.url} alt="" className="max-h-[50dvh] w-full rounded-lg object-contain" />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => replaceInput.current?.click()}>
                Заменить
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  const id = openPhoto;
                  setOpenPhoto(null);
                  void remove(id);
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={peopleOpen} onOpenChange={setPeopleOpen} title="Мои люди">
        <ul className="grid grid-cols-3 gap-2">
          {others.map((p) => {
            const main = p.photos.find((x) => x.id === p.mainPhotoId) ?? p.photos[0];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={async () => {
                    setPeopleOpen(false);
                    await change({ op: "assign", roleId: r.id, personId: p.id });
                  }}
                  className="flex w-full flex-col gap-1 rounded-lg p-1 text-left hover:bg-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={main.url} alt="" className="aspect-square w-full rounded-md object-cover" />
                  <span className="truncate text-[13px]">{p.name}</span>
                </button>
              </li>
            );
          })}
          {person && (
            <li>
              <button
                type="button"
                onClick={async () => {
                  setPeopleOpen(false);
                  await change({ op: "clear", roleId: r.id });
                }}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[13px] text-muted hover:border-border-strong hover:text-fg"
              >
                <Plus className="size-5" aria-hidden />
                Новый
              </button>
            </li>
          )}
        </ul>
      </Dialog>
    </div>
  );
}
