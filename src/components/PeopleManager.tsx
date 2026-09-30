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
  Avatar,
  Badge,
  Button,
  EmptyState,
  FancyIcon,
  Skeleton,
  toast,
} from "@/ui/rapui";
import { Switch } from "@/ui/Switch";
import { Trash2 } from "@/ui/icons";
import { api } from "@/client/api";
import type { PersonDTO } from "@/lib/server/present";

export function PeopleManager() {
  const [people, setPeople] = useState<PersonDTO[] | null>(null);
  const load = useCallback(async () => {
    try {
      setPeople(await api<PersonDTO[]>("/api/people"));
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
      const res = await api<{ removedFiles: number }>(`/api/people/${p.id}`, { method: "DELETE" });
      toast.success(`${p.name} удалён вместе с материалами (${res.removedFiles} файлов)`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const toggle = async (p: PersonDTO, saved: boolean) => {
    await api(`/api/people/${p.id}`, { method: "PATCH", json: { saved } });
    await load();
  };

  return (
    <div className="page flex flex-col gap-6 pt-6 md:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-[2rem] font-medium tracking-[-0.03em]">Мои люди</h1>
        <p className="max-w-2xl text-[0.9375rem] text-ink-2">
          Исходные фото хранятся закрыто и видны только вам. Сохранённых людей мы предлагаем в новых мемах. Удаление стирает фото и все образы, созданные из них.
        </p>
      </div>
      {!people ? (
        <Skeleton height={200} />
      ) : people.length === 0 ? (
        <EmptyState
          icon={<FancyIcon icon="camera" tone="blue" float />}
          title="Пока никого"
          description="Людей добавляют прямо в конструкторе, когда назначают их на роли."
          action={
            <Link href="/">
              <Button variant="accent">К мемам</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-tile sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => {
            const main = p.photos.find((x) => x.id === p.mainPhotoId) ?? p.photos[0];
            return (
              <li key={p.id} className="flex flex-col gap-4 rounded-card bg-surface p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} src={main?.url} size="lg" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[1.15rem] font-medium">{p.name}</span>
                    <span className="text-[0.8125rem] text-mute">{p.photos.length} фото</span>
                  </div>
                  {!p.saved && (
                    <span className="ml-auto">
                      <Badge variant="outline" size="sm">
                        разово
                      </Badge>
                    </span>
                  )}
                </div>
                {p.photos.length > 0 && (
                  <div className="flex gap-tight overflow-x-auto">
                    {p.photos.map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ph.id} src={ph.url} alt="" className="h-20 w-16 shrink-0 rounded-[12px] object-cover" loading="lazy" />
                    ))}
                  </div>
                )}
                <Switch checked={p.saved} onCheckedChange={(v) => void toggle(p, v)} label="Предлагать в новых мемах" />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button icon={<Trash2 size={15} />} iconPosition="start" variant="ghost" size="sm">
                      Удалить человека и материалы
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить «{p.name}»?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Удалятся все фото этого человека и все образы и фото сцен, созданные с ним. Его роли в черновиках освободятся. Готовые видео останутся — их можно удалить отдельно.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction variant="danger" onClick={() => void remove(p)}>
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
