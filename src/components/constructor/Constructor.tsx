"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Badge, Button, EmptyState, FancyIcon, RadioGroup, RadioGroupItem, Skeleton, toast } from "@/ui/rapui";
import { ArrowUpDown, Check, Lock, RefreshCw, Volume2 } from "@/ui/icons";
import { api, ApiError, formatPrice, previewsLeftText } from "@/client/api";
import { TONE_INK, TONE_VAR } from "@/client/tones";
import type { ClientTemplate } from "@/lib/templates/client";
import type { DraftDTO, PersonDTO, RoleDTO } from "@/lib/server/present";
import type { DraftOp } from "@/lib/server/services/drafts";
import type { LookSettings } from "@/lib/domain/types";
import { useMe } from "../AppProvider";
import { useDraft } from "./useDraft";
import { RoleFrame } from "./RoleFrame";
import { PersonPicker, type PickerPerson } from "./PersonPicker";
import { PhotosTab } from "./PhotosTab";
import { LookTab } from "./LookTab";
import { PreviewHistory } from "./PreviewHistory";
import { DemoPanel } from "./DemoPanel";

type Tab = "photos" | "look" | "preview";
type Step = { kind: "cast"; roleId?: string } | { kind: "person"; roleId: string; tab: Tab } | { kind: "scene" } | { kind: "video" };

function parseStep(s: string | null): Step | null {
  if (!s) return null;
  if (s === "scene" || s === "video") return { kind: s };
  if (s.startsWith("cast")) return { kind: "cast", roleId: s.split(".")[1] || undefined };
  const [k, roleId, tab] = s.split(".");
  if (k === "p" && roleId) return { kind: "person", roleId, tab: (["photos", "look", "preview"].includes(tab) ? tab : "photos") as Tab };
  return null;
}
function stepKey(s: Step): string {
  if (s.kind === "person") return `p.${s.roleId}.${s.tab}`;
  if (s.kind === "cast") return s.roleId ? `cast.${s.roleId}` : "cast";
  return s.kind;
}

/** Where to continue after a reload: the first thing not done yet. */
function firstOpenStep(t: ClientTemplate, d: DraftDTO): Step {
  const unassigned = d.roles.find((r) => !r.person);
  if (unassigned) return { kind: "cast", roleId: unassigned.roleId };
  const noPhotos = d.roles.find((r) => !r.photosReady);
  if (noPhotos) return { kind: "person", roleId: noPhotos.roleId, tab: "photos" };
  const unconfirmed = d.roles.find((r) => !r.confirmedPreviewId);
  if (unconfirmed) return { kind: "person", roleId: unconfirmed.roleId, tab: "preview" };
  if (!d.scene.confirmedPreviewId) return { kind: "scene" };
  void t;
  return { kind: "video" };
}

export function Constructor({ template: t }: { template: ClientTemplate }) {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { draft, error, reload, mutate } = useDraft(draftId);
  const { me, refresh: refreshMe } = useMe();
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [pickerRole, setPickerRole] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    try {
      setPeople(await api<PersonDTO[]>("/api/people"));
    } catch {
      /* the picker shows only «new person» then */
    }
  }, []);
  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const step: Step | null = useMemo(() => parseStep(search.get("s")) ?? (draft ? firstOpenStep(t, draft) : null), [search, draft, t]);
  const go = useCallback((s: Step) => router.push(`?s=${stepKey(s)}`, { scroll: false }), [router]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [step?.kind, step && "tab" in step ? step.tab : null]);

  const roleName = useCallback((id: string) => t.roles.find((r) => r.id === id)?.name ?? id, [t]);
  const personName = useCallback((id: string) => draft?.roles.find((r) => r.roleId === id)?.person?.name ?? roleName(id), [draft, roleName]);

  /** run a draft change and explain any confirmation it removed */
  const change = useCallback(
    async (op: DraftOp) => {
      try {
        const next = await mutate(op);
        for (const c of next.cleared) {
          if (c.roleId) toast(`Подтверждение образа «${roleName(c.roleId)}» снято — данные изменились. Прежний вариант остался в истории.`);
          if (c.scene) toast("Подтверждение финального фото снято — состав или образы изменились. Прежнее фото осталось в истории.");
        }
        return next;
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
    },
    [mutate, roleName],
  );
  const refreshAll = useCallback(async () => {
    await Promise.all([reload(), loadPeople()]);
  }, [reload, loadPeople]);

  const generate = async (roleId?: string) => {
    setBusy(roleId ? `gen-${roleId}` : "gen-scene");
    try {
      await api(`/api/drafts/${draftId}/previews`, { method: "POST", json: roleId ? { roleId } : {} });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      void refreshMe();
    }
  };

  const startVideo = async () => {
    setBusy("video");
    try {
      const res = await api<{ job: { id: string }; created: boolean }>(`/api/drafts/${draftId}/video`, { method: "POST" });
      if (!res.created) toast("Это видео уже создаётся — открываем его");
      router.push(`/orders/${res.job.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  if (error)
    return (
      <div className="page pt-10">
        <EmptyState
          icon={<FancyIcon icon="ghost" tone="plum" float />}
          title={error.status === 404 ? "Черновик не найден" : "Не удалось открыть черновик"}
          description={error.message}
          action={
            <Link href="/">
              <Button variant="soft">К мемам</Button>
            </Link>
          }
        />
      </div>
    );
  if (!draft || !step)
    return (
      <div className="page grid gap-6 pt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Skeleton className="aspect-[9/16] max-h-[78dvh] w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton height={36} width="60%" shape="pill" />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      </div>
    );

  const roleDto = (id: string) => draft.roles.find((r) => r.roleId === id)!;
  /** cast everyone first, then prepare people one by one */
  const afterCast = (next: DraftDTO) => {
    const unassigned = next.roles.find((r) => !r.person);
    if (unassigned) go({ kind: "cast", roleId: unassigned.roleId });
    else {
      const todo = next.roles.find((r) => !r.photosReady) ?? next.roles.find((r) => !r.confirmedPreviewId);
      if (todo) go({ kind: "person", roleId: todo.roleId, tab: todo.photosReady ? "look" : "photos" });
      else go({ kind: "scene" });
    }
  };
  const allAssigned = draft.roles.every((r) => r.person);
  const allConfirmed = draft.roles.every((r) => r.confirmedPreviewId);
  const quota = draft.quota;

  // people for the picker: saved ones + anyone already cast in this draft
  const pickerPeople: PickerPerson[] = [
    ...people.filter((p) => p.saved || draft.roles.some((r) => r.person?.id === p.id)),
  ].map((p) => {
    const inRole = draft.roles.find((r) => r.person?.id === p.id);
    return { ...p, inRole: inRole && inRole.roleId !== pickerRole ? roleName(inRole.roleId) : undefined };
  });

  /* ── steps bar ─────────────────────────────────────────────────── */
  const steps: { key: string; label: string; state: "done" | "current" | "open" | "locked"; to: Step }[] = [
    { key: "cast", label: "Роли", state: allAssigned ? "done" : "open", to: { kind: "cast" } },
    ...t.roles.map((r) => {
      const dto = roleDto(r.id);
      return {
        key: r.id,
        label: dto.person?.name ?? r.name,
        state: (dto.confirmedPreviewId ? "done" : dto.person ? "open" : "locked") as "done" | "open" | "locked",
        to: { kind: "person" as const, roleId: r.id, tab: (dto.photosReady ? (dto.previews.length ? "preview" : "look") : "photos") as Tab },
      };
    }),
    { key: "scene", label: "Сцена", state: draft.scene.confirmedPreviewId ? "done" : allConfirmed ? "open" : "locked", to: { kind: "scene" } },
    { key: "video", label: "Видео", state: draft.scene.confirmedPreviewId ? "open" : "locked", to: { kind: "video" } },
  ];
  const currentKey = step.kind === "person" ? step.roleId : step.kind;

  /* ── per-step content ─────────────────────────────────────────── */
  let stage: ReactNode = null;
  let panel: ReactNode = null;
  let primary: ReactNode = null;
  let showStageOnMobile = true;

  if (step.kind === "cast") {
    const active = step.roleId ?? draft.roles.find((r) => !r.person)?.roleId ?? t.roles[0].id;
    const activeRole = t.roles.find((r) => r.id === active)!;
    stage = <RoleFrame template={t} roles={draft.roles} activeRoleId={active} onRoleClick={(id) => go({ kind: "cast", roleId: id })} />;
    panel = (
      <div className="flex flex-col gap-4">
        <StepTitle eyebrow={`${t.title} · кто играет`} title={activeRole.question} lead={activeRole.description} />
        <ul className="flex flex-col gap-tile">
          {t.roles.map((r) => (
            <RoleCard
              key={r.id}
              role={r}
              dto={roleDto(r.id)}
              active={r.id === active}
              onFocus={() => go({ kind: "cast", roleId: r.id })}
              onPick={() => setPickerRole(r.id)}
              onClear={() => void change({ op: "clear", roleId: r.id })}
              onOpen={() => go({ kind: "person", roleId: r.id, tab: roleDto(r.id).photosReady ? "look" : "photos" })}
              swapTargets={t.roles.filter((x) => x.id !== r.id).map((x) => ({ id: x.id, name: x.name }))}
              onSwap={(other) => void change({ op: "swap", roleA: r.id, roleB: other })}
            />
          ))}
        </ul>
      </div>
    );
    const nextUnassigned = draft.roles.find((r) => !r.person);
    primary = !roleDto(active).person ? (
      <Button variant="accent" size="lg" block onClick={() => setPickerRole(active)}>
        Выбрать человека
      </Button>
    ) : nextUnassigned ? (
      <Button variant="accent" size="lg" block icon onClick={() => go({ kind: "cast", roleId: nextUnassigned.roleId })}>
        Дальше: {roleName(nextUnassigned.roleId).toLowerCase()}
      </Button>
    ) : (
      <Button variant="accent" size="lg" block icon onClick={() => afterCast(draft)}>
        Дальше: фото и образы
      </Button>
    );
  }

  if (step.kind === "person") {
    const role = t.roles.find((r) => r.id === step.roleId);
    const dto = role ? roleDto(role.id) : null;
    if (!role || !dto?.person) {
      panel = (
        <EmptyState
          title="Для этой роли ещё никто не выбран"
          action={
            <Button variant="accent" onClick={() => go({ kind: "cast", roleId: step.roleId })}>
              Выбрать человека
            </Button>
          }
        />
      );
    } else {
      const person = dto.person;
      const selected = dto.previews.find((p) => p.id === dto.selectedPreviewId) ?? null;
      const pending = dto.previews.some((p) => p.status === "pending" && p.fingerprint === dto.fingerprint);
      const selectedIsCurrent = selected?.fingerprint === dto.fingerprint;
      const confirmed = Boolean(dto.confirmedPreviewId);
      const roleIndex = t.roles.findIndex((r) => r.id === role.id);
      const nextRole = t.roles[roleIndex + 1];
      const lastFailed = [...dto.previews].reverse().find((p) => p.fingerprint === dto.fingerprint);
      showStageOnMobile = step.tab === "preview";

      stage =
        step.tab === "preview" ? (
          <PreviewStage
            aspect={t.aspectRatio}
            url={selected?.url ?? null}
            pending={pending && !selected}
            isDemo={selected?.isDemo ?? false}
            stale={Boolean(selected && !selectedIsCurrent)}
            emptyText={`Здесь появится образ: ${person.name} в роли «${role.name}»`}
            demoText="Демо-пример: это ваше фото в рамке, а не образ от нейросети. Сходство можно проверить только в реальном режиме."
          />
        ) : (
          <RoleFrame template={t} roles={draft.roles} activeRoleId={role.id} onRoleClick={(id) => go({ kind: "person", roleId: id, tab: step.tab })} />
        );

      const tabs = (
        <div className="flex gap-tight rounded-pill bg-fill p-1" role="tablist" aria-label="Подготовка человека">
          {(
            [
              ["photos", "Фото"],
              ["look", "Образ"],
              ["preview", "Превью"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={step.tab === k}
              disabled={k !== "photos" && !dto.photosReady}
              onClick={() => go({ kind: "person", roleId: role.id, tab: k })}
              className={`h-control-sm flex-1 rounded-pill text-[0.9375rem] font-medium transition-colors duration-(--rap-dur-fast) ease-rm disabled:opacity-40 ${
                step.tab === k ? "bg-ink text-paper" : "text-ink hover:bg-fill-hover"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      );

      panel = (
        <div className="flex flex-col gap-5">
          <StepTitle
            eyebrow={<RoleChip tone={role.tone} name={role.name} />}
            title={step.tab === "photos" ? `Фото: ${person.name}` : step.tab === "look" ? `Образ: ${person.name}` : `Превью: ${person.name}`}
            lead={
              step.tab === "photos"
                ? "Исходные фото человека. Они сохраняются за ним и пригодятся в других мемах."
                : step.tab === "look"
                  ? `Как ${person.name} будет выглядеть в этом меме. Настройки бесплатны — изображение создаётся только по кнопке.`
                  : "Проверьте образ. Подтверждение бесплатно и не запускает новую генерацию."
            }
          />
          {tabs}
          {step.tab === "photos" && <PhotosTab template={t} person={person} onChanged={refreshAll} />}
          {step.tab === "look" && (
            <LookTab
              template={t}
              role={dto}
              person={person}
              onLook={(look: Partial<LookSettings>) => change({ op: "look", roleId: role.id, look })}
              onPersonChanged={refreshAll}
            />
          )}
          {step.tab === "preview" && (
            <div className="flex flex-col gap-4">
              {confirmed && (
                <Alert variant="success" title="Образ подтверждён">
                  Если поменять фото, роль или одежду, подтверждение снимется, а этот вариант останется в истории.
                </Alert>
              )}
              {selected && !selectedIsCurrent && (
                <Alert variant="warning" title="Этот вариант сделан для прежних настроек">
                  Фото или образ изменились. Создайте новый вариант или верните прежние настройки.
                </Alert>
              )}
              {lastFailed?.status === "failed" && !pending && <Alert variant="danger" title="Не получилось создать образ">{lastFailed.error} Превью не списано.</Alert>}
              <PreviewHistory
                label="История вариантов"
                previews={dto.previews}
                selectedId={dto.selectedPreviewId}
                confirmedId={dto.confirmedPreviewId}
                currentFingerprint={dto.fingerprint}
                onSelect={(id) => void change({ op: "select", roleId: role.id, previewId: id })}
              />
              <div className="flex flex-wrap gap-tight">
                <Button variant="soft" size="sm" onClick={() => go({ kind: "person", roleId: role.id, tab: "look" })}>
                  Изменить настройки
                </Button>
                <Button variant="soft" size="sm" onClick={() => go({ kind: "person", roleId: role.id, tab: "photos" })}>
                  Заменить фото
                </Button>
                {selected && (
                  <Button icon={<RefreshCw size={16} />} iconPosition="start" variant="soft" size="sm" onClick={() => generate(role.id)} disabled={pending || quota.left <= 0} state={busy === `gen-${role.id}` ? "loading" : undefined}>
                    Другой вариант
                  </Button>
                )}
              </div>
              <QuotaLine left={quota.left} isDemo={draft.video.isDemo} onReset={refreshAll} />
              <p className="text-[0.8125rem] text-mute">
                Одобренный образ — ориентир внешности для видео. Нейросеть может менять детали в отдельных кадрах; точное сходство в каждом кадре мы пока не обещаем.
              </p>
            </div>
          )}
        </div>
      );

      const nextStep: Step = !nextRole
        ? { kind: "scene" }
        : roleDto(nextRole.id).person
          ? steps[roleIndex + 2].to
          : { kind: "cast", roleId: nextRole.id };
      if (step.tab === "photos")
        primary = dto.photosReady ? (
          <Button variant="accent" size="lg" block icon onClick={() => go({ kind: "person", roleId: role.id, tab: "look" })}>
            Дальше: образ
          </Button>
        ) : (
          <Button variant="accent" size="lg" block onClick={() => document.getElementById(`photo-input-${person.id}`)?.click()}>
            Загрузить фото
          </Button>
        );
      else if (step.tab === "look")
        primary = (
          <Button variant="accent" size="lg" block icon onClick={() => go({ kind: "person", roleId: role.id, tab: "preview" })}>
            Дальше: превью
          </Button>
        );
      else if (confirmed)
        primary = (
          <Button variant="accent" size="lg" block icon onClick={() => go(nextStep)}>
            {nextRole ? `Дальше: ${personName(nextRole.id)}` : "Дальше: сцена"}
          </Button>
        );
      else if (selected && selectedIsCurrent && selected.status === "ready")
        primary = (
          <Button icon={<Check size={18} />} iconPosition="start" variant="accent" size="lg" block onClick={() => void change({ op: "confirm", roleId: role.id, previewId: selected.id })}>
            Подтвердить образ
          </Button>
        );
      else
        primary = (
          <Button
            variant="accent"
            size="lg"
            block
            disabled={pending || quota.left <= 0}
            onClick={() => generate(role.id)}
            state={pending || busy === `gen-${role.id}` ? "loading" : undefined}
            loadingLabel="Готовим образ…"
          >
            {quota.left <= 0 ? "Превью закончились" : "Создать превью"}
          </Button>
        );
    }
  }

  if (step.kind === "scene") {
    const sc = draft.scene;
    const selected = sc.previews.find((p) => p.id === sc.selectedPreviewId) ?? null;
    const pending = sc.previews.some((p) => p.status === "pending" && p.fingerprint === sc.fingerprint);
    const selectedIsCurrent = selected?.fingerprint === sc.fingerprint;
    const lastFailed = [...sc.previews].reverse().find((p) => p.fingerprint === sc.fingerprint);
    stage = selected ? (
      <PreviewStage
        aspect={t.aspectRatio}
        url={selected.url}
        pending={false}
        isDemo={selected.isDemo}
        stale={!selectedIsCurrent}
        emptyText=""
        demoText="Демо-коллаж: одобренные образы наложены на кадр шаблона. Это не сгенерированная сцена."
      />
    ) : pending ? (
      <PreviewStage aspect={t.aspectRatio} url={null} pending isDemo={false} stale={false} emptyText="" demoText="" />
    ) : (
      <RoleFrame template={t} roles={draft.roles} />
    );
    panel = !allConfirmed ? (
      <EmptyState title="Сначала подтвердите образы всех участников" description="Финальное фото сцены собирается из одобренных образов." />
    ) : (
      <div className="flex flex-col gap-5">
        <StepTitle eyebrow="Вся сцена" title="Финальное фото" lead="Соберём общий кадр с назначенными людьми. Проверьте состав, внешность и расположение." />
        {t.scene.options.length > 1 ? (
          <RadioGroup variant="card" value={draft.sceneOptionId} onValueChange={(v) => void change({ op: "scene", optionId: v })} aria-label="Настройки сцены">
            {t.scene.options.map((o) => (
              <RadioGroupItem key={o.id} value={o.id} label={o.label} description={o.description} />
            ))}
          </RadioGroup>
        ) : (
          <p className="rounded-row bg-fill px-4 py-3 text-[0.9375rem]">
            <b className="font-medium">{t.scene.options[0].label}.</b> {t.scene.options[0].description}
          </p>
        )}
        <ul className="flex flex-col gap-tight" aria-label="Состав">
          {t.roles.map((r) => {
            const d = roleDto(r.id);
            const conf = d.previews.find((p) => p.id === d.confirmedPreviewId);
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-row bg-fill px-3 py-2">
                {conf?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={conf.url} alt="" className="h-12 w-9 rounded-[10px] object-cover" />
                )}
                <span className="flex flex-col">
                  <span className="text-[0.9375rem] font-medium">{d.person?.name}</span>
                  <span className="text-[0.8125rem] text-mute">{r.name}</span>
                </span>
                <button type="button" onClick={() => go({ kind: "person", roleId: r.id, tab: "preview" })} className="ml-auto text-[0.8125rem] text-blue">
                  Изменить
                </button>
              </li>
            );
          })}
        </ul>
        {t.roles.length === 2 && (
          <Button icon={<ArrowUpDown size={16} />} iconPosition="start" variant="soft" size="sm" onClick={() => void change({ op: "swap", roleA: t.roles[0].id, roleB: t.roles[1].id })}>
            Поменять участников местами
          </Button>
        )}
        {draft.scene.confirmedPreviewId && <Alert variant="success" title="Фото сцены подтверждено" />}
        {selected && !selectedIsCurrent && <Alert variant="warning" title="Это фото сделано для прежнего состава или настроек">Создайте новое.</Alert>}
        {lastFailed?.status === "failed" && !pending && <Alert variant="danger" title="Не получилось собрать сцену">{lastFailed.error} Превью не списано.</Alert>}
        <PreviewHistory
          label="История фото сцены"
          previews={sc.previews}
          selectedId={sc.selectedPreviewId}
          confirmedId={sc.confirmedPreviewId}
          currentFingerprint={sc.fingerprint}
          onSelect={(id) => void change({ op: "select", previewId: id })}
        />
        {selected && (
          <Button icon={<RefreshCw size={16} />} iconPosition="start" variant="soft" size="sm" onClick={() => generate()} disabled={pending || quota.left <= 0} state={busy === "gen-scene" ? "loading" : undefined}>
            Другой вариант
          </Button>
        )}
        <QuotaLine left={quota.left} isDemo={draft.video.isDemo} onReset={refreshAll} />
      </div>
    );
    primary = !allConfirmed ? (
      <Button variant="accent" size="lg" block onClick={() => go(steps.find((s) => s.state === "open" && s.key !== "cast")?.to ?? { kind: "cast" })}>
        К неподтверждённым образам
      </Button>
    ) : draft.scene.confirmedPreviewId ? (
      <Button variant="accent" size="lg" block icon onClick={() => go({ kind: "video" })}>
        Дальше: видео
      </Button>
    ) : selected && selectedIsCurrent ? (
      <Button icon={<Check size={18} />} iconPosition="start" variant="accent" size="lg" block onClick={() => void change({ op: "confirm", previewId: selected.id })}>
        Подтвердить фото сцены
      </Button>
    ) : (
      <Button variant="accent" size="lg" block disabled={pending || quota.left <= 0} onClick={() => generate()} state={pending || busy === "gen-scene" ? "loading" : undefined} loadingLabel="Собираем сцену…">
        {quota.left <= 0 ? "Превью закончились" : "Создать фото сцены"}
      </Button>
    );
  }

  if (step.kind === "video") {
    const conf = draft.scene.previews.find((p) => p.id === draft.scene.confirmedPreviewId);
    const job = draft.video.lastJob;
    const jobForThisScene = job && job.status !== "failed";
    stage = conf ? (
      <PreviewStage aspect={t.aspectRatio} url={conf.url} pending={false} isDemo={conf.isDemo} stale={false} emptyText="" demoText="Демо-коллаж сцены, не сгенерированное изображение." />
    ) : (
      <RoleFrame template={t} roles={draft.roles} />
    );
    const testMode = draft.video.isDemo || !t.price;
    panel = !conf ? (
      <EmptyState title="Сначала подтвердите финальное фото сцены" />
    ) : (
      <div className="flex flex-col gap-5">
        <StepTitle eyebrow="Последний шаг" title="Создать видео" lead="Мы оживим подтверждённый кадр по движениям исходного ролика и наложим оригинальный звук." />
        <dl className="grid grid-cols-2 gap-tile">
          <Fact label="Длительность" value={`${t.durationSec} с`} />
          <Fact label="Звук" value={<span className="inline-flex items-center gap-1.5"><Volume2 size={16} /> оригинальный</span>} />
          <Fact label="Участники" value={draft.roles.map((r) => r.person?.name).join(", ")} />
          <Fact label="Стоимость" value={testMode ? "Тестовая генерация" : formatPrice(t.price)} />
        </dl>
        {testMode ? (
          <Alert variant="info" title="Тестовая генерация">
            {draft.video.isDemo
              ? "Демо-режим: будет показан пример ролика с вашим подтверждённым кадром в углу. Это не персональное видео."
              : "Оплата пока не подключена. Будет создан тестовый заказ, деньги не списываются."}
          </Alert>
        ) : (
          <Alert variant="info" title={formatPrice(t.price)}>
            Сейчас оплата не подключена — создаётся тестовый заказ без списания денег.
          </Alert>
        )}
        <details className="rounded-row bg-fill px-4 py-3 text-[0.875rem]">
          <summary className="cursor-pointer font-medium">Что передаётся видеомодели</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink-2">
            {draft.video.plan.used.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          {draft.video.plan.notPassed.length > 0 && (
            <>
              <p className="mt-2 font-medium">Не передаётся:</p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-2">
                {draft.video.plan.notPassed.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          )}
        </details>
        {!draft.video.plan.ok && <Alert variant="danger" title="Сценарий недоступен">{draft.video.plan.problem}</Alert>}
        <p className="text-[0.8125rem] text-mute">
          Подтверждённое фото — ориентир внешности, а не гарантия, что каждый кадр видео повторит его в точности. После запуска страницу можно закрыть — видео найдётся в «Мои видео».
        </p>
        {jobForThisScene && (
          <Alert variant="neutral" title="Видео по этому черновику уже запускалось" action={<Link href={`/orders/${job.id}`}><Button size="sm" variant="soft">Открыть</Button></Link>} />
        )}
      </div>
    );
    primary = (
      <Button variant="accent" size="lg" block disabled={!draft.video.canStart} onClick={startVideo} state={busy === "video" ? "loading" : undefined} icon>
        {testMode ? "Создать видео (тест)" : "Создать видео"}
      </Button>
    );
  }

  return (
    <div className="page flex flex-col gap-4 pt-3 lg:pt-6">
      <StepsBar steps={steps} currentKey={currentKey} onGo={go} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        <div className={`lg:sticky lg:top-24 ${showStageOnMobile ? "" : "hidden lg:block"}`}>
          <div className="mx-auto w-full max-w-[min(100%,calc(62dvh*9/16))] lg:max-w-[min(100%,calc((100dvh-8rem)*9/16))]">{stage}</div>
        </div>
        <div className="flex flex-col gap-6">
          <div key={stepKey(step)} className="fun:animate-deal-in">
            {panel}
          </div>
          <div data-primary="desktop" className="sticky bottom-4 z-10 hidden rounded-pill shadow-pop lg:block">{primary}</div>
          {me?.config.isDemo && <DemoPanel onChange={refreshAll} />}
        </div>
      </div>
      {/* phone: one main action, always under the thumb */}
      <div data-primary="mobile" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)] backdrop-blur-md lg:hidden">{primary}</div>
      <PersonPicker
        open={pickerRole !== null}
        onOpenChange={(v) => !v && setPickerRole(null)}
        question={t.roles.find((r) => r.id === pickerRole)?.question ?? ""}
        people={pickerPeople}
        currentPersonId={pickerRole ? roleDto(pickerRole)?.person?.id : null}
        onPick={async (personId) => {
          const next = await change({ op: "assign", roleId: pickerRole!, personId });
          afterCast(next);
        }}
        onCreate={async (name, saved) => {
          const p = await api<PersonDTO>("/api/people", { method: "POST", json: { name, saved } });
          const next = await change({ op: "assign", roleId: pickerRole!, personId: p.id });
          await loadPeople();
          afterCast(next);
        }}
      />
    </div>
  );
}

/* ── small pieces ─────────────────────────────────────────────────── */

function StepTitle({ eyebrow, title, lead }: { eyebrow: ReactNode; title: string; lead?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[0.8125rem] font-medium text-mute">{eyebrow}</div>
      <h1 className="text-[1.75rem] leading-[1.1] font-medium tracking-[-0.03em] sm:text-[2.25rem]">{title}</h1>
      {lead && <p className="text-[0.9375rem] text-ink-2">{lead}</p>}
    </div>
  );
}

function RoleChip({ tone, name }: { tone: keyof typeof TONE_VAR; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[0.8125rem] font-medium" style={{ background: TONE_VAR[tone], color: TONE_INK[tone] }}>
      {name}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-row bg-fill px-4 py-3">
      <dt className="text-[0.8125rem] text-mute">{label}</dt>
      <dd className="text-[0.9375rem] font-medium">{value}</dd>
    </div>
  );
}

function QuotaLine({ left, isDemo, onReset }: { left: number; isDemo: boolean; onReset: () => Promise<unknown> }) {
  if (left > 0) return <p className="text-[0.8125rem] text-mute">{previewsLeftText(left)}. Подтверждение и выбор прежних вариантов их не тратят.</p>;
  return (
    <Alert
      variant="warning"
      title="Бесплатные превью закончились"
      action={
        isDemo ? (
          <Button
            size="sm"
            variant="soft"
            onClick={async () => {
              await api("/api/demo", { method: "POST", json: { resetQuota: true } });
              await onReset();
              toast.success("Демо-счётчик превью сброшен");
            }}
          >
            Сбросить (демо)
          </Button>
        ) : undefined
      }
    >
      Можно выбрать и подтвердить любой из уже созданных вариантов — это бесплатно.
    </Alert>
  );
}

function PreviewStage({
  aspect,
  url,
  pending,
  isDemo,
  stale,
  emptyText,
  demoText,
}: {
  aspect: string;
  url: string | null;
  pending: boolean;
  isDemo: boolean;
  stale: boolean;
  emptyText: string;
  demoText: string;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative w-full overflow-hidden rounded-card bg-fill" style={{ aspectRatio: aspect.replace(":", " / ") }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="Превью" className={`absolute inset-0 size-full object-cover fun:animate-fade-in ${stale ? "opacity-60" : ""}`} />
        ) : pending ? (
          <div className="absolute inset-0 grid place-items-center">
            <Skeleton className="absolute inset-0 rounded-none" />
            <span className="relative rounded-pill bg-surface px-4 py-2 text-[0.9375rem] font-medium shadow-pop">Готовим изображение…</span>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-[0.9375rem] text-mute">{emptyText}</div>
        )}
        {stale && url && (
          <span className="absolute top-3 left-3">
            <Badge variant="warning">прежние настройки</Badge>
          </span>
        )}
      </div>
      {isDemo && url && <figcaption className="text-[0.8125rem] leading-snug text-mute">{demoText}</figcaption>}
    </figure>
  );
}

function StepsBar({
  steps,
  currentKey,
  onGo,
}: {
  steps: { key: string; label: string; state: "done" | "current" | "open" | "locked"; to: Step }[];
  currentKey: string;
  onGo: (s: Step) => void;
}) {
  return (
    <nav aria-label="Шаги" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ol className="flex w-max gap-tight">
        {steps.map((s, i) => {
          const current = s.key === currentKey;
          const locked = s.state === "locked";
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={locked}
                aria-current={current ? "step" : undefined}
                onClick={() => onGo(s.to)}
                className={`flex h-control-sm items-center gap-2 rounded-pill pr-4 pl-1.5 text-[0.875rem] font-medium transition-colors duration-(--rap-dur-fast) ease-rm ${
                  current ? "bg-ink text-paper" : locked ? "bg-fill text-mute" : "bg-surface text-ink hover:bg-fill-hover"
                }`}
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-[0.75rem] ${
                    s.state === "done" ? "bg-success text-white" : current ? "bg-paper text-ink" : "bg-fill"
                  }`}
                >
                  {s.state === "done" ? <Check size={13} /> : locked ? <Lock size={12} /> : i + 1}
                </span>
                <span className="max-w-[9rem] truncate">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function RoleCard({
  role,
  dto,
  active,
  onFocus,
  onPick,
  onClear,
  onOpen,
  swapTargets,
  onSwap,
}: {
  role: ClientTemplate["roles"][number];
  dto: RoleDTO;
  active: boolean;
  onFocus: () => void;
  onPick: () => void;
  onClear: () => void;
  onOpen: () => void;
  swapTargets: { id: string; name: string }[];
  onSwap: (otherRoleId: string) => void;
}) {
  const main = dto.person?.photos.find((p) => p.id === dto.person?.mainPhotoId) ?? dto.person?.photos[0];
  return (
    <li
      className={`flex flex-col gap-3 rounded-card bg-surface p-4 transition-shadow duration-(--rap-dur-fast) ease-rm ${active ? "shadow-[0_0_0_2px_var(--role-color)]" : ""}`}
      style={{ ["--role-color" as string]: TONE_VAR[role.tone] }}
      onClick={onFocus}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full text-[1.1rem] font-semibold" style={{ background: TONE_VAR[role.tone], color: TONE_INK[role.tone] }}>
          {main ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={main.url} alt="" className="size-full object-cover" />
          ) : dto.person ? (
            dto.person.name.slice(0, 1).toUpperCase()
          ) : (
            "?"
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[0.8125rem] text-mute">{role.name}</span>
          <span className="truncate text-[1.05rem] font-medium">{dto.person?.name ?? "Не выбран"}</span>
        </span>
        {dto.confirmedPreviewId && (
          <span className="ml-auto">
            <Badge variant="success" size="sm">
              образ ✓
            </Badge>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-tight">
        <Button size="sm" variant={dto.person ? "soft" : "accent"} onClick={(e) => (e.stopPropagation(), onPick())}>
          {dto.person ? "Заменить" : "Выбрать человека"}
        </Button>
        {dto.person && (
          <Button size="sm" variant="soft" onClick={(e) => (e.stopPropagation(), onOpen())}>
            Фото и образ
          </Button>
        )}
        {dto.person &&
          swapTargets.map((s) => (
            <Button icon={<ArrowUpDown size={15} />} iconPosition="start" key={s.id} size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), onSwap(s.id))}>
              {swapTargets.length === 1 ? "Поменять местами" : `↔ ${s.name}`}
            </Button>
          ))}
        {dto.person && (
          <Button size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), onClear())}>
            Убрать
          </Button>
        )}
      </div>
    </li>
  );
}
