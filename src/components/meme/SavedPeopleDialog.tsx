"use client";
import { useEffect, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { api } from "@/client/api";
import { useI18n } from "@/i18n/client";
import type { PersonDTO } from "@/lib/server/present";
import { Dialog } from "@/ui/dialog";
import { Spinner } from "@/ui/spinner";

/** Pick a saved person for this participant, or start with someone new. */
export function SavedPeopleDialog({ open, onOpenChange, currentId, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; currentId: string | null; onPick: (p: PersonDTO | null) => void }) {
  const { m, fmt, plur } = useI18n();
  const [people, setPeople] = useState<PersonDTO[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setPeople(null);
    api<PersonDTO[]>("/api/people").then(
      (list) => setPeople(list.filter((p) => p.saved && p.photos.length > 0)),
      () => setPeople([]),
    );
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={m.flow.savedPeople} description={m.flow.saveNote} closeLabel={m.common.close}>
      {people === null ? (
        <div className="grid h-24 place-items-center text-muted">
          <Spinner />
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {people.length === 0 && <li className="px-2 py-3 text-sm text-muted">{m.flow.noSavedPeople}</li>}
          {people.map((p) => {
            const main = p.photos.find((x) => x.id === p.mainPhotoId) ?? p.photos[0];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  aria-label={fmt(m.flow.choosePerson, { name: p.name })}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={main.url} alt="" className="size-11 rounded-full object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{p.name}</span>
                    <span className="block text-[13px] text-muted">{plur(m.people.photos, p.photos.length)}</span>
                  </span>
                  {p.id === currentId && <Check className="size-4 text-fg" aria-hidden />}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => onPick(null)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06]">
              <span className="grid size-11 place-items-center rounded-full border border-dashed border-white/20 text-muted">
                <UserPlus className="size-[18px]" aria-hidden />
              </span>
              <span className="text-[15px]">{m.flow.someoneNew}</span>
            </button>
          </li>
        </ul>
      )}
    </Dialog>
  );
}
