"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  EmptyState,
  FancyIcon,
  Skeleton,
  toast,
} from "@/ui/rapui";
import { Trash2 } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { api } from "@/client/api";
import type { PersonDTO } from "@/lib/server/present";

/** The saved-people library: photos stay private; delete removes the person and their files. */
export function PeopleManager() {
  const [people, setPeople] = useState<PersonDTO[] | null>(null);
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
      toast.success("Удалено");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="page flex flex-col gap-5 pt-2 md:pt-6">
      <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">Мои люди</h1>
      {!people ? (
        <Skeleton height={200} />
      ) : people.length === 0 ? (
        <EmptyState
          icon={<FancyIcon icon="camera" tone="blue" float />}
          title="Пока никого"
          action={
            <Link href="/">
              <Button variant="accent">К мемам</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-tile sm:grid-cols-3 lg:grid-cols-4">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-card bg-surface p-2">
              <div className="grid grid-cols-3 gap-tight overflow-hidden rounded-[18px]">
                {p.photos.slice(0, 3).map((ph) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={ph.id} src={ph.url} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <span className="truncate text-[0.9375rem] font-medium">{p.name}</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" aria-label={`Удалить ${p.name}`} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-fill hover:text-danger focus-visible:outline-2 focus-visible:outline-ring">
                      <Trash2 size={17} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить {p.name}?</AlertDialogTitle>
                      <AlertDialogDescription>Фото и превью с этим человеком удалятся. Готовые видео останутся.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel roll={false}>Отмена</AlertDialogCancel>
                      <AlertDialogAction roll={false} variant="danger" onClick={() => void remove(p)}>
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
