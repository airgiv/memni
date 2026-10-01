"use client";
/** Saved people: rename, delete photos, delete the person. Stays in this browser (prototype). */
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/client/api";
import { errorText, useI18n } from "@/i18n/client";
import type { PersonDTO } from "@/lib/server/present";
import { Button, IconButton } from "@/ui/button";
import { Input } from "@/ui/field";
import { Spinner } from "@/ui/spinner";

export function PeopleManager() {
  const { m, fmt, plur } = useI18n();
  const [people, setPeople] = useState<PersonDTO[] | null>(null);
  const load = () => api<PersonDTO[]>("/api/people").then((l) => setPeople(l.filter((p) => p.saved)), () => setPeople([]));
  useEffect(() => void load(), []);

  const rename = async (p: PersonDTO, name: string) => {
    if (!name.trim() || name === p.name) return;
    try {
      await api(`/api/people/${p.id}`, { method: "PATCH", json: { name } });
      await load();
    } catch (e) {
      toast.error(errorText(m, e));
    }
  };
  const removePerson = async (p: PersonDTO) => {
    if (!window.confirm(fmt(m.people.confirmDelete, { name: p.name }))) return;
    try {
      await api(`/api/people/${p.id}`, { method: "DELETE" });
      toast(m.people.deleted);
      await load();
    } catch (e) {
      toast.error(errorText(m, e));
    }
  };
  const removePhoto = async (id: string) => {
    try {
      await api(`/api/photos/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(errorText(m, e));
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-[calc(var(--safe-bottom)+40px)] pt-8 sm:px-6 lg:pt-12">
      <h1 className="text-[30px] font-semibold tracking-tight">{m.people.title}</h1>
      <p className="mt-2 max-w-xl text-[14px] text-muted">{m.people.note}</p>
      {people === null ? (
        <div className="mt-10 text-muted">
          <Spinner />
        </div>
      ) : people.length === 0 ? (
        <p className="mt-10 text-muted">{m.people.empty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {people.map((p) => (
            <li key={p.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <label className="flex-1">
                  <span className="sr-only">{m.people.renameLabel}</span>
                  <Input defaultValue={p.name} maxLength={40} onBlur={(e) => void rename(p, e.target.value)} className="max-w-xs" />
                </label>
                <span className="text-[13px] text-muted">{plur(m.people.photos, p.photos.length)}</span>
                <Button variant="danger" size="sm" onClick={() => void removePerson(p)}>
                  {fmt(m.people.deletePerson, { name: "" }).replace(/[:\s]+$/, "")}
                </Button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.photos.map((ph) => (
                  <li key={ph.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt="" className="size-20 rounded-xl object-cover" />
                    <IconButton label={m.people.deletePhoto} size="sm" className="absolute right-1 top-1 bg-black/60 text-white hover:bg-black/80" onClick={() => void removePhoto(ph.id)}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
