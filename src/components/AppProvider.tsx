"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { api } from "@/client/api";
import type { PublicConfig } from "@/lib/config";
import { TelegramBridge } from "./TelegramBridge";

export interface Me {
  config: PublicConfig;
  user: { kind: string; displayName: string | null };
  drafts: { id: string; templateId: string; updatedAt: string; assigned: number; lastJobId: string | null }[];
}

const Ctx = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} });
export const useMe = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      /* pages show their own errors */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <Ctx.Provider value={{ me, refresh }}>
      <TelegramBridge onLogin={refresh} />
      {children}
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{ classNames: { toast: "!bg-surface-2 !border !border-border !text-fg", description: "!text-muted" } }}
      />
    </Ctx.Provider>
  );
}
