"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/client/api";
import { usePolling } from "@/client/hooks";
import type { DraftDTO } from "@/lib/server/present";
import type { DraftOp } from "@/lib/server/services/drafts";

/**
 * Client copy of the draft. Guards against stale answers: a response is
 * applied only if its version is not older than what we already show, and
 * mutations run one at a time so each carries the version it was based on.
 */
export function useDraft(id: string) {
  const [draft, setDraft] = useState<DraftDTO | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const current = useRef<DraftDTO | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const apply = useCallback((next: DraftDTO) => {
    if (current.current && next.version < current.current.version) return current.current;
    current.current = next;
    setDraft(next);
    return next;
  }, []);

  const reload = useCallback(async () => {
    try {
      return apply(await api<DraftDTO>(`/api/drafts/${id}`));
    } catch (e) {
      setError(e as ApiError);
      return null;
    }
  }, [id, apply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pending =
    Boolean(draft?.roles.some((r) => r.previews.some((p) => p.status === "pending"))) ||
    Boolean(draft?.scene.previews.some((p) => p.status === "pending"));
  usePolling(() => void reload(), 1500, pending);

  /** Run one change; on a version conflict reload and try once more. */
  const mutate = useCallback(
    (op: DraftOp): Promise<DraftDTO> => {
      const run = async () => {
        const send = async () => {
          const version = current.current?.version ?? 0;
          return apply(await api<DraftDTO>(`/api/drafts/${id}`, { method: "PATCH", json: { ...op, version } }));
        };
        try {
          return await send();
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            await reload();
            return await send();
          }
          throw e;
        }
      };
      const p = queue.current.then(run, run);
      queue.current = p.catch(() => undefined);
      return p;
    },
    [id, apply, reload],
  );

  return { draft, error, reload, mutate };
}
