"use client";
import { useRef, useState } from "react";
import { Alert, Badge, toast } from "@/ui/rapui";
import { Switch } from "@/ui/Switch";
import { Check, Star, Trash2, Upload, X } from "@/ui/icons";
import { api } from "@/client/api";
import type { ClientTemplate } from "@/lib/templates/client";
import type { PersonDTO } from "@/lib/server/present";

interface Uploading {
  key: string;
  name: string;
  url: string;
  error?: string;
}

const MAX_MB = 12;

/**
 * Source photos of one person. Photos belong to the PERSON (reused in other
 * memes); the look for this meme is set in the next tab. Checks here are
 * honest format checks — type, size, resolution — done again on the server.
 * There is no face-quality score because no face analyser is connected.
 */
export function PhotosTab({
  template,
  person,
  onChanged,
}: {
  template: ClientTemplate;
  person: PersonDTO;
  onChanged: () => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const req = template.photoRequirements;
  const full = person.photos.length >= 8;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, 8 - person.photos.length));
    // show thumbnails right away; uploads run one by one in the background
    const items = list.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, name: f.name, url: URL.createObjectURL(f), file: f }));
    setUploading((u) => [...u, ...items.map(({ file, ...rest }) => (void file, rest))]);
    const newNotes: string[] = [];
    for (const it of items) {
      const f = it.file;
      let error: string | undefined;
      if (!req.acceptedTypes.includes(f.type) && f.type !== "") error = "Подойдут фото JPEG, PNG или WebP";
      else if (f.size > MAX_MB * 1024 * 1024) error = `Файл больше ${MAX_MB} МБ`;
      if (!error) {
        try {
          const fd = new FormData();
          fd.append("file", f);
          const res = await api<{ notes: string[] }>(`/api/people/${person.id}/photos`, { method: "POST", body: fd });
          newNotes.push(...res.notes);
          await onChanged();
        } catch (e) {
          error = (e as Error).message;
        }
      }
      setUploading((u) => (error ? u.map((x) => (x.key === it.key ? { ...x, error } : x)) : u.filter((x) => x.key !== it.key)));
      if (!error) URL.revokeObjectURL(it.url);
    }
    setNotes([...new Set(newNotes)]);
    if (input.current) input.current.value = "";
  };

  const setMain = async (photoId: string) => {
    try {
      await api(`/api/people/${person.id}`, { method: "PATCH", json: { mainPhotoId: photoId } });
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const remove = async (photoId: string) => {
    try {
      await api(`/api/photos/${photoId}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const setSaved = async (saved: boolean) => {
    try {
      await api(`/api/people/${person.id}`, { method: "PATCH", json: { saved } });
      await onChanged();
      toast.success(saved ? `${person.name} сохранён для следующих роликов` : "Не будем предлагать в следующих роликах");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-tile sm:grid-cols-4" aria-label="Подсказки к фото">
        {[
          { ok: true, t: "Лицо целиком и чётко" },
          { ok: true, t: "Дневной ровный свет" },
          { ok: false, t: "Тёмные очки и маски" },
          { ok: false, t: "Несколько людей в кадре" },
        ].map((h) => (
          <div key={h.t} className="flex items-center gap-2 rounded-row bg-fill px-3 py-2.5 text-[0.8125rem] leading-tight">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full ${h.ok ? "bg-success text-white" : "bg-danger text-white"}`}>
              {h.ok ? <Check size={14} /> : <X size={14} />}
            </span>
            {h.t}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[0.9375rem] font-medium">Для «{template.title}»:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem] text-ink-2">
          {req.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>
            Нужно минимум {req.minPhotos} фото, лучше {req.recommendedPhotos}: разные ракурсы помогают узнаваемости. Не меньше {req.minSidePx} px по короткой стороне.
          </li>
        </ul>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-line bg-surface px-4 py-8 text-center transition-colors duration-(--rap-dur-fast) ease-rm hover:border-blue ${full ? "pointer-events-none opacity-50" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }}
      >
        <Upload size={28} className="text-blue" />
        <span className="text-[1rem] font-medium">{person.photos.length ? "Добавить ещё фото" : `Загрузите фото: ${person.name}`}</span>
        <span className="text-[0.8125rem] text-mute">JPEG, PNG или WebP до {MAX_MB} МБ · можно несколько сразу</span>
        <input
          ref={input}
          id={`photo-input-${person.id}`}
          type="file"
          accept={req.acceptedTypes.join(",")}
          multiple
          className="sr-only"
          onChange={(e) => void upload(e.target.files)}
          disabled={full}
        />
      </label>

      {notes.length > 0 && (
        <Alert variant="info" onDismiss={() => setNotes([])}>
          {notes.join(". ")}
        </Alert>
      )}

      {(person.photos.length > 0 || uploading.length > 0) && (
        <ul className="grid grid-cols-3 gap-tile sm:grid-cols-4" aria-label="Фото">
          {person.photos.map((p) => {
            const main = p.id === person.mainPhotoId;
            return (
              <li key={p.id} className="group relative aspect-[3/4] overflow-hidden rounded-[18px] bg-fill fun:animate-pop-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                {main && (
                  <span className="absolute top-2 left-2">
                    <Badge variant="blue" size="sm">
                      Главное
                    </Badge>
                  </span>
                )}
                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
                  {!main && (
                    <button type="button" onClick={() => setMain(p.id)} className="flex h-8 items-center gap-1 rounded-pill bg-black/60 px-2.5 text-[0.75rem] text-white" aria-label="Сделать главным">
                      <Star size={14} /> Главное
                    </button>
                  )}
                  <button type="button" onClick={() => remove(p.id)} className="ml-auto grid size-8 place-items-center rounded-full bg-black/60 text-white" aria-label="Удалить фото">
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
          {uploading.map((u) => (
            <li key={u.key} className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-fill">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.url} alt="" className={`size-full object-cover ${u.error ? "opacity-40" : "opacity-70"}`} />
              <span className="absolute inset-x-1.5 bottom-1.5 rounded-row bg-black/70 px-2 py-1 text-[0.75rem] leading-tight text-white">
                {u.error ?? "Загружается…"}
              </span>
              {u.error && (
                <button
                  type="button"
                  className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white"
                  aria-label="Убрать"
                  onClick={() => setUploading((x) => x.filter((y) => y.key !== u.key))}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {person.photos.length > 1 && (
        <p className="text-[0.8125rem] text-mute">Главное фото — основа образа, остальные — дополнительные референсы для сходства.</p>
      )}

      <div className="flex flex-col gap-1 rounded-row bg-fill px-4 py-3">
        <Switch checked={person.saved} onCheckedChange={setSaved} label={`Сохранить ${person.name} для следующих роликов`} />
        <p className="text-[0.8125rem] text-mute">Фото хранятся закрыто и видны только вам. Удалить человека и все его материалы можно в любой момент.</p>
      </div>
      {!full ? null : <p className="text-[0.8125rem] text-mute">Это максимум фото для одного человека.</p>}
    </div>
  );
}
