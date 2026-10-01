"use client";
/**
 * One participant: who is being replaced, 1–3 photos (or a saved person),
 * then outfit and appearance once a photo is in. One primary action.
 */
import { useEffect, useRef, useState } from "react";
import { Collapsible } from "radix-ui";
import { AlertCircle, ChevronDown, ImagePlus, MoreHorizontal, Shuffle, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/client/api";
import { useObjectUrl } from "@/client/hooks";
import { errorText, useI18n } from "@/i18n/client";
import type { DraftDTO, PersonDTO, RoleDTO } from "@/lib/server/present";
import type { DraftOp } from "@/lib/server/services/drafts";
import type { ClientMeme, ClientRole } from "@/memes/client";
import { Button } from "@/ui/button";
import { Chips } from "@/ui/chips";
import { cn } from "@/ui/cn";
import { Input, Textarea } from "@/ui/field";
import { Menu } from "@/ui/menu";
import { Select } from "@/ui/select";
import { Spinner } from "@/ui/spinner";
import { Switch } from "@/ui/switch";
import { ActionBar } from "@/ui/action-bar";
import { SavedPeopleDialog } from "./SavedPeopleDialog";

const MAX_BYTES = 12 * 1024 * 1024;

export function ParticipantStep({
  meme,
  role,
  data,
  draft,
  mutate,
  reload,
  onContinue,
}: {
  meme: ClientMeme;
  role: ClientRole;
  data: RoleDTO | null;
  draft: DraftDTO;
  mutate: (op: DraftOp) => Promise<DraftDTO>;
  reload: () => Promise<DraftDTO | null>;
  onContinue: () => void;
}) {
  const { m, fmt } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<File | null>(null);
  const uploadingUrl = useObjectUrl(uploading);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [saveNew, setSaveNew] = useState(true);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const person = data?.person ?? null;
  const photos = person?.photos ?? [];
  const max = draft.maxPhotos;
  const look = data?.look ?? null;

  const pick = (replace: string | null) => {
    setReplaceId(replace);
    input.current?.click();
  };

  const upload = async (file: File) => {
    if (!meme.photos.accept.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      toast.error(/hei[cf]/i.test(file.type + file.name) ? m.errors.heic : m.errors.bad_format);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(m.errors.too_big);
      return;
    }
    setUploading(file);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("save", person ? String(person.saved) : String(saveNew));
      form.set("nameTemplate", m.flow.personName);
      // replacing: upload first so a failed upload keeps the old photo — unless the person is at the limit
      const before = replaceId && photos.length >= max;
      if (replaceId && before) await api(`/api/photos/${replaceId}`, { method: "DELETE" });
      await api(`/api/drafts/${draft.id}/roles/${role.id}/photos`, { method: "POST", body: form });
      if (replaceId && !before) await api(`/api/photos/${replaceId}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      toast.error(errorText(m, e));
      await reload();
    } finally {
      setUploading(null);
      setReplaceId(null);
    }
  };

  const remove = async (photoId: string) => {
    try {
      await api(`/api/photos/${photoId}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      toast.error(errorText(m, e));
    }
  };

  const setSaved = async (saved: boolean) => {
    if (!person) {
      setSaveNew(saved);
      return;
    }
    try {
      await api(`/api/people/${person.id}`, { method: "PATCH", json: { saved } });
      await reload();
    } catch (e) {
      toast.error(errorText(m, e));
    }
  };

  const onPerson = async (p: PersonDTO | null) => {
    setPeopleOpen(false);
    try {
      await mutate(p ? { op: "assign", roleId: role.id, personId: p.id } : { op: "clear", roleId: role.id });
    } catch (e) {
      toast.error(errorText(m, e));
    }
  };

  const hasPhotos = photos.length > 0;
  const issues = [...new Set(photos.flatMap((p) => p.analysis?.issues ?? []))];
  const hasFullBody = photos.some((p) => p.analysis?.body === "full");

  return (
    <div className="flex flex-col gap-4">
      {/* whom you are replacing (the video behind is also centred and spotlit on them) */}
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={role.cutout} alt={`${role.name}: ${role.hint}`} className="h-[60px] w-[45px] shrink-0 rounded-lg object-cover lg:h-[72px] lg:w-[54px]" />
        <div className="min-w-0">
          <p className="text-[13px] leading-tight text-muted">{m.flow.replacing}</p>
          <h2 className="text-[18px] font-semibold leading-snug">{role.name}</h2>
          <p className="truncate text-[13px] leading-tight text-muted">{role.hint}</p>
        </div>
      </div>

      {/* photos */}
      <div>
        <input
          ref={input}
          type="file"
          accept={meme.photos.accept.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        {!hasPhotos && !uploading ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="lg" icon={<ImagePlus className="size-[18px]" aria-hidden />} onClick={() => pick(null)}>
              {m.flow.upload}
            </Button>
            <Button variant="secondary" size="lg" icon={<Users className="size-[18px]" aria-hidden />} onClick={() => setPeopleOpen(true)}>
              {m.flow.savedPeople}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ul className="flex flex-1 flex-wrap gap-2">
              {photos.map((p, i) => (
                <li key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={fmt(m.flow.photoAlt, { n: i + 1, name: person?.name ?? "" })} className={cn("size-16 rounded-xl object-cover", replaceId === p.id && uploading && "opacity-40")} />
                  <Menu
                    trigger={
                      <button type="button" aria-label={fmt(m.flow.photoOptions, { n: i + 1 })} className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full border border-white/10 bg-[#1c1c1f] text-white hover:bg-[#2a2a2e]">
                        <MoreHorizontal className="size-4" aria-hidden />
                      </button>
                    }
                    items={[
                      { label: m.flow.replacePhoto, onSelect: () => pick(p.id) },
                      { label: m.flow.removePhoto, onSelect: () => void remove(p.id), danger: true },
                    ]}
                  />
                </li>
              ))}
              {uploading && !replaceId && (
                <li className="relative size-16 overflow-hidden rounded-xl" aria-live="polite">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {uploadingUrl && <img src={uploadingUrl} alt="" className="size-full object-cover opacity-40" />}
                  <span className="absolute inset-0 grid place-items-center">
                    <Spinner />
                    <span className="sr-only">{m.flow.uploading}</span>
                  </span>
                </li>
              )}
              {photos.length + (uploading && !replaceId ? 1 : 0) < max && (
                <li>
                  <button
                    type="button"
                    onClick={() => pick(null)}
                    disabled={Boolean(uploading)}
                    aria-label={m.flow.addPhoto}
                    title={m.flow.addPhoto}
                    className="grid size-16 place-items-center rounded-xl border border-dashed border-white/20 text-muted transition-colors hover:border-white/40 hover:text-fg disabled:opacity-40"
                  >
                    <ImagePlus className="size-5" aria-hidden />
                  </button>
                </li>
              )}
            </ul>
            {person && (
              <div className="flex min-w-0 shrink-0 flex-col items-end">
                <span className="max-w-[120px] truncate text-[13px] text-fg-2">{person.name}</span>
                <button type="button" onClick={() => setPeopleOpen(true)} className="text-[13px] text-muted underline-offset-2 hover:text-fg hover:underline">
                  {m.flow.change}
                </button>
              </div>
            )}
          </div>
        )}
        <p className="mt-2 text-[13px] text-muted">{m.flow.photoHint}</p>
        {hasPhotos && (issues.length > 0 || (!hasFullBody && photos.length < max)) && (
          <ul className="mt-1.5 flex flex-col gap-1 text-[13px] leading-snug">
            {issues.map((i) => (
              <li key={i} className="flex items-start gap-1.5 text-warning">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {m.flow.issues[i as keyof typeof m.flow.issues]}
              </li>
            ))}
            {!hasFullBody && photos.length < max && <li className="text-faint">{m.flow.fullBodyHint}</li>}
          </ul>
        )}
      </div>

      {/* outfit and appearance — once a photo is in */}
      {hasPhotos && look && <LookControls meme={meme} role={role} look={look} mutate={mutate} />}

      {/* keep or not: a small line with a compact opt-out */}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[12px] leading-snug text-faint">{(person ? person.saved : saveNew) ? m.flow.saveNote : m.flow.notSavedNote}</p>
        <Switch id={`save-${role.id}`} label={m.flow.saveLabel} checked={person ? person.saved : saveNew} onCheckedChange={(v) => void setSaved(v)} className="shrink-0 flex-row-reverse" />
      </div>

      <ActionBar>
        <Button variant="primary" size="lg" className="w-full lg:w-auto lg:min-w-[160px]" disabled={!data?.ready || Boolean(uploading)} onClick={onContinue}>
          {m.common.continue}
        </Button>
      </ActionBar>

      <SavedPeopleDialog open={peopleOpen} onOpenChange={setPeopleOpen} currentId={person?.id ?? null} onPick={(p) => void onPerson(p)} />
    </div>
  );
}

function LookControls({ meme, role, look, mutate }: { meme: ClientMeme; role: ClientRole; look: NonNullable<RoleDTO["look"]>; mutate: (op: DraftOp) => Promise<DraftDTO> }) {
  const { m, fmt } = useI18n();
  const option = role.outfits.find((o) => o.id === look.outfit.optionId) ?? role.outfits[0];
  const [custom, setCustom] = useState(look.outfit.text ?? "");
  const [desc, setDesc] = useState(look.appearance.description ?? "");
  const [open, setOpen] = useState(look.appearance.mode === "adjusted");
  useEffect(() => setCustom(look.outfit.text ?? ""), [look.outfit.text]);
  useEffect(() => setDesc(look.appearance.description ?? ""), [look.appearance.description]);

  const run = (op: Omit<Extract<DraftOp, { op: "look" }>, "op" | "roleId">) => mutate({ op: "look", roleId: role.id, ...op }).catch((e) => toast.error(errorText(m, e)));
  const presentation = look.appearance.mode === "adjusted" ? (look.appearance.presentation ?? "photos") : "photos";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`outfit-${role.id}`} className="text-[14px] text-fg-2">
            {m.flow.outfit}
          </label>
          <Select
            id={`outfit-${role.id}`}
            label={m.flow.outfit}
            value={option.id}
            options={role.outfits.map((o) => ({ value: o.id, label: o.label }))}
            onValueChange={(v) => void run({ outfit: { optionId: v } })}
            className="w-[min(240px,62%)]"
          />
        </div>
        {option.kind === "random" && look.outfit.resolvedPresetId && (
          <div className="flex items-center justify-between gap-2 text-[13px] text-fg-2">
            <span>{fmt(m.flow.randomDrawn, { name: meme.outfitLabels[look.outfit.resolvedPresetId] ?? look.outfit.resolvedPresetId })}</span>
            <Button variant="ghost" size="sm" icon={<Shuffle className="size-3.5" aria-hidden />} onClick={() => void run({ outfit: { optionId: option.id }, reroll: true })}>
              {m.flow.drawAgain}
            </Button>
          </div>
        )}
        {option.kind === "custom" && (
          <Input
            aria-label={m.flow.customLabel}
            placeholder={m.flow.customPlaceholder}
            maxLength={80}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={() => custom !== (look.outfit.text ?? "") && void run({ outfit: { optionId: option.id, text: custom } })}
          />
        )}
      </div>

      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] text-fg-2">
            {presentation === "photos" && !look.appearance.description ? m.flow.appearanceFromPhotos : `${m.flow.presentation}: ${presentationLabel(m, presentation)}`}
          </span>
          <Collapsible.Trigger asChild>
            <Button variant="ghost" size="sm" icon={<ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />}>
              {m.flow.adjustAppearance}
            </Button>
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.03] p-3.5">
          <Chips
            label={m.flow.presentation}
            value={presentation}
            onValueChange={(v) =>
              void run({ appearance: v === "photos" ? { mode: "photos" } : { mode: "adjusted", presentation: v as "feminine" | "masculine" | "neutral", description: desc || undefined } })
            }
            options={[
              { value: "photos", label: m.flow.presentationPhotos },
              { value: "feminine", label: m.flow.feminine },
              { value: "masculine", label: m.flow.masculine },
              { value: "neutral", label: m.flow.neutral },
            ]}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">{m.flow.describe}</span>
            <Textarea
              rows={2}
              maxLength={160}
              placeholder={m.flow.describePlaceholder}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() =>
                desc !== (look.appearance.description ?? "") &&
                void run({ appearance: { mode: "adjusted", presentation: presentation === "photos" ? undefined : presentation, description: desc } })
              }
            />
          </label>
          <p className="text-[12px] leading-snug text-faint">{m.flow.noInference}</p>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

function presentationLabel(m: ReturnType<typeof useI18n>["m"], p: string) {
  return p === "feminine" ? m.flow.feminine : p === "masculine" ? m.flow.masculine : p === "neutral" ? m.flow.neutral : m.flow.presentationPhotos;
}
