"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Spinner } from "@/ui/spinner";
import { api } from "@/client/api";
import type { PersonDTO } from "@/lib/server/present";

/** The saved-people library. Photos are private; deleting removes the person and their files. */
export function PeopleManager() {
  const [people, setPeople] = useState<PersonDTO[] | null>(null);
  const [confirm, setConfirm] = useState<PersonDTO | null>(null);
  const load = useCallback(async () => {
    try {
      setPeople((await api<PersonDTO[]>("/api/people")).filter((p) => p.saved));
    } catch (e) {
      toast.error((e as Error).message);
      setPeople([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const remove = async (p: PersonDTO) => {
    try {
      await api(`/api/people/${p.id}`, { method: "DELETE" });
      setConfirm(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-5 md:px-6 md:pt-8">
      <h1 className="text-[20px] font-semibold tracking-tight">Мои люди</h1>
      {!people ? (
        <Spinner label="Загружаем" />
      ) : people.length === 0 ? (
        <p className="text-muted">
          Пока никого. <Link href="/" className="text-fg underline underline-offset-4">К мемам</Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {people.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="grid grid-cols-3 gap-px bg-border">
                {p.photos.slice(0, 3).map((ph) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={ph.id} src={ph.url} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
                <span className="truncate text-[14px]">{p.name}</span>
                <button type="button" onClick={() => setConfirm(p)} aria-label={`Удалить ${p.name}`} className="grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)} title={`Удалить ${confirm?.name ?? ""}?`}>
        <p className="mb-4 text-[14px] text-muted">Фото и превью с этим человеком удалятся. Готовые видео останутся.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button className="!bg-danger !text-bg hover:!bg-danger/90" onClick={() => confirm && void remove(confirm)}>
            Удалить
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
