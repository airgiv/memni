"use client";
import { useRef, useState } from "react";
import { Avatar, toast } from "@/ui/rapui";
import { Plus, RefreshCw, X } from "@/ui/icons";
import { Switch } from "@/ui/Switch";
import { api } from "@/client/api";
import type { ClientTemplate } from "@/lib/templates/client";
import type { PersonDTO, RoleDTO } from "@/lib/server/present";
import type { LookSettings } from "@/lib/domain/types";
import type { DraftOp } from "@/lib/server/services/drafts";

const MAX_MB = 12;

interface Uploading {
  key: string;
  url: string;
  error?: string;
}

/** Look tags from the template: only what this meme supports, one choice. */
function lookTags(t: ClientTemplate) {
  const tags: { value: string; label: string }[] = [];
  for (const m of t.look.clothingModes) {
    if (m === "template") tags.push({ value: "template", label: t.look.templateOutfit.label });
    if (m === "photo") tags.push({ value: "photo", label: "Одежда с фото" });
    if (m === "preset") for (const p of t.look.presets) tags.push({ value: `preset:${p.id}`, label: p.label });
  }
  return tags;
}
function lookValue(l: LookSettings | null) {
  if (!l) return "template";
  return l.clothing === "preset" ? `preset:${l.presetId}` : l.clothing;
}
function lookFromValue(v: string): Partial<LookSettings> {
  return v.startsWith("preset:") ? { clothing: "preset", presetId: v.slice(7) } : { clothing: v as LookSettings["clothing"] };
}

/**
 * «Replace this person»: the real cutout from the source video, the upload,
 * saved people, and — once there is a photo — a few look tags. No per-person
 * generation happens here.
 */
export function ParticipantStep({
  template: t,
  draftId,
  index,
  role,
  savedPeople,
  change,
  reload,
}: {
  template: ClientTemplate;
  draftId: string;
  index: number;
  role: RoleDTO;
  savedPeople: PersonDTO[];
  change: (op: DraftOp) => Promise<unknown>;
  reload: () => Promise<unknown>;
}) {
  const r = t.roles[index];
  const person = role.person;
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  // «Не сохранять»: off by default — new people go to the library
  const [dontSave, setDontSave] = useState(false);
  const notSaved = person ? !person.saved : dontSave;
  const max = 3;
  const count = person?.photos.length ?? 0;

  const upload = async (files: File[], replaceId?: string) => {
    const list = files.slice(0, replaceId ? 1 : Math.max(1, 8 - count));
    const items = list.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, url: URL.createObjectURL(f), file: f }));
    // thumbnails show right away; uploads go one by one
    setUploading((u) => [...u, ...items.map(({ key, url }) => ({ key, url }))]);
    for (const it of items) {
      let error: string | undefined;
      if (it.file.size > MAX_MB * 1024 * 1024) error = `Файл больше ${MAX_MB} МБ`;
      else {
        try {
          const fd = new FormData();
          fd.append("file", it.file);
          fd.append("save", String(!dontSave));
          await api(`/api/drafts/${draftId}/roles/${r.id}/photos`, { method: "POST", body: fd });
          if (replaceId) await api(`/api/photos/${replaceId}`, { method: "DELETE" });
          await reload();
        } catch (e) {
          error = (e as Error).message;
        }
      }
      if (error) toast.error(error);
      setUploading((u) => u.filter((x) => x.key !== it.key));
      URL.revokeObjectURL(it.url);
    }
  };

  const remove = async (photoId: string) => {
    try {
      await api(`/api/photos/${photoId}`, { method: "DELETE" });
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

  const others = savedPeople.filter((p) => p.saved && p.id !== person?.id && p.photos.length > 0);
  const tags = lookTags(t);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
      <figure className="mx-auto w-full max-w-[min(100%,calc(34dvh*3/4))] lg:sticky lg:top-24 lg:max-w-[440px]">
        {/* the person as they appear in the source video — prepared once with the template */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.cutout.src} alt={r.name} className="aspect-[3/4] w-full rounded-card object-cover" />
      </figure>

      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[1.6rem] leading-tight font-medium tracking-[-0.03em] sm:text-[2rem]">Заменим этого человека</h1>
          <span className="shrink-0 rounded-pill bg-surface px-3 py-1 text-[0.875rem] text-ink-2">
            {index + 1} из {t.roles.length}
          </span>
        </div>

        {others.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[0.8125rem] text-mute">Мои люди</p>
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Мои люди">
              {others.map((p) => {
                const main = p.photos.find((x) => x.id === p.mainPhotoId) ?? p.photos[0];
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => void change({ op: "assign", roleId: r.id, personId: p.id })}
                      className="flex w-16 flex-col items-center gap-1 rounded-row p-1 text-[0.75rem] text-ink-2 hover:bg-fill focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <Avatar name={p.name} src={main?.url} size="lg" />
                      <span className="w-full truncate text-center">{p.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <ul className="grid grid-cols-3 gap-tile" aria-label="Фото">
            {person?.photos.map((p) => (
              <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-fill fun:animate-pop-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="size-full object-cover" />
                <div className="absolute inset-x-1.5 top-1.5 flex justify-between">
                  <button
                    type="button"
                    aria-label="Заменить фото"
                    onClick={() => {
                      setReplacing(p.id);
                      replaceInput.current?.click();
                    }}
                    className="grid size-8 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <RefreshCw size={15} />
                  </button>
                  <button type="button" aria-label="Удалить фото" onClick={() => void remove(p.id)} className="grid size-8 place-items-center rounded-full bg-black/60 text-white">
                    <X size={15} />
                  </button>
                </div>
              </li>
            ))}
            {uploading.map((u) => (
              <li key={u.key} className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-fill">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u.url} alt="" className="size-full object-cover opacity-60" />
                <span className="absolute inset-x-0 bottom-2 text-center text-[0.75rem] text-white">Загружаем…</span>
              </li>
            ))}
            {count + uploading.length < max && (
              <li className={count + uploading.length === 0 ? "col-span-3" : ""}>
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-line bg-surface p-4 text-center transition-colors duration-(--rap-dur-fast) ease-rm hover:border-ring focus-within:outline-2 focus-within:outline-ring ${
                    count + uploading.length === 0 ? "py-10" : "aspect-[3/4]"
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(Array.from(e.dataTransfer.files));
                  }}
                >
                  <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-ink">
                    <Plus size={22} />
                  </span>
                  {count + uploading.length === 0 && <span className="text-[1rem] font-medium">Добавь 1–3 фото. Лучше три</span>}
                  <input
                    ref={input}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    aria-label="Добавить фото"
                    onChange={(e) => {
                      void upload(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                </label>
              </li>
            )}
          </ul>
          <input
            ref={replaceInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && replacing) void upload([f], replacing);
              e.target.value = "";
              setReplacing(null);
            }}
          />
          {count > 0 && count < max && <p className="text-[0.8125rem] text-mute">Лучше три фото</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Switch checked={notSaved} onCheckedChange={(v) => void toggleSave(v)} label="Не сохранять" onText="" offText="" />
            <span className="text-[0.8125rem] text-mute">{notSaved ? "Только для этого ролика" : "Сохраним в «Мои люди»"}</span>
          </div>
          {person && (
            <button type="button" onClick={() => void change({ op: "clear", roleId: r.id })} className="self-start text-[0.875rem] text-ink-2 underline-offset-4 hover:underline">
              Другой человек
            </button>
          )}
        </div>

        {count > 0 && tags.length > 1 && (
          <div className="flex flex-col gap-2 fun:animate-deal-in">
            <p className="text-[0.8125rem] text-mute">Образ</p>
            <div role="radiogroup" aria-label="Образ" className="flex flex-wrap gap-tight">
              {tags.map((tag) => {
                const on = tag.value === lookValue(role.look);
                return (
                  <button
                    key={tag.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => !on && void change({ op: "look", roleId: r.id, look: lookFromValue(tag.value) })}
                    className={`h-control-sm rounded-pill px-4 text-[0.9375rem] font-medium transition-colors duration-(--rap-dur-fast) ease-rm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      on ? "bg-ink text-paper" : "bg-fill text-ink hover:bg-fill-hover"
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
