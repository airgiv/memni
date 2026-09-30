"use client";
import { useState, type ReactNode } from "react";
import {
  Avatar,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  Separator,
} from "@/ui/rapui";
import { Switch } from "@/ui/Switch";
import { useIsDesktop } from "@/client/hooks";
import type { PersonDTO } from "@/lib/server/present";

export interface PickerPerson extends PersonDTO {
  /** role name if this person is already cast in this draft */
  inRole?: string;
}

/** Dialog on desktop, bottom drawer on phones — same content. */
export function Adaptive({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  if (desktop)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md" showClose>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent handle>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="max-h-[70dvh] overflow-y-auto px-4 pb-[calc(var(--safe-bottom)+16px)]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function PersonPicker({
  open,
  onOpenChange,
  question,
  people,
  currentPersonId,
  onPick,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  question: string;
  people: PickerPerson[];
  currentPersonId?: string | null;
  onPick: (personId: string) => Promise<void>;
  onCreate: (name: string, saved: boolean) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: string) => {
    setBusy(id);
    try {
      await onPick(id);
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };
  const create = async () => {
    if (!name.trim()) {
      setError("Как подписать этого человека? Например, «Саша»");
      return;
    }
    setBusy("new");
    setError(null);
    try {
      await onCreate(name.trim(), saved);
      setName("");
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Adaptive open={open} onOpenChange={onOpenChange} title={question} description="Выберите из сохранённых или добавьте нового человека.">
      <div className="flex flex-col gap-4 pt-2">
        {people.length > 0 && (
          <ul className="flex flex-col gap-tight" aria-label="Люди">
            {people.map((p) => {
              const main = p.photos.find((x) => x.id === p.mainPhotoId) ?? p.photos[0];
              const isCurrent = p.id === currentPersonId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={isCurrent || busy !== null}
                    onClick={() => pick(p.id)}
                    className="flex w-full items-center gap-3 rounded-row bg-fill px-3 py-2.5 text-left transition-colors duration-(--rap-dur-fast) ease-rm hover:bg-fill-hover disabled:opacity-60"
                  >
                    <Avatar name={p.name} src={main?.url} size="md" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[0.9375rem] font-medium">{p.name}</span>
                      <span className="text-[0.8125rem] text-mute">
                        {isCurrent
                          ? "Уже в этой роли"
                          : p.inRole
                            ? `Сейчас: ${p.inRole} — поменяются местами`
                            : `${p.photos.length} фото${p.saved ? " · сохранён" : ""}`}
                      </span>
                    </span>
                    {busy === p.id && <span className="ml-auto text-[0.8125rem] text-mute">…</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {people.length > 0 && <Separator label="или" />}
        <div className="flex flex-col gap-3">
          <FormField label="Новый человек" error={error ?? undefined}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя или как вы его зовёте"
              maxLength={40}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </FormField>
          <Switch checked={saved} onCheckedChange={setSaved} label="Сохранить для следующих роликов" />
          <p className="text-[0.8125rem] text-mute">
            Сохранённый человек появится в этом списке в следующий раз. Удалить его вместе со всеми фото можно в «Мои люди».
          </p>
          <Button variant="accent" block onClick={create} state={busy === "new" ? "loading" : undefined}>
            Добавить и назначить
          </Button>
        </div>
      </div>
    </Adaptive>
  );
}
