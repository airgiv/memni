"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SoundProvider, Toaster, TooltipProvider } from "@/ui/rapui";
import { api } from "@/client/api";
import type { PublicConfig } from "@/lib/config";
import { TelegramBridge } from "./TelegramBridge";

export interface Me {
  config: PublicConfig;
  user: { kind: string; displayName: string | null };
  quota: { used: number; limit: number; left: number };
  drafts: { id: string; templateId: string; updatedAt: string; assigned: number; sceneConfirmed: boolean; lastJobId: string | null }[];
  jobs: { id: string; status: string; draftId: string; createdAt: string; isDemo: boolean; input: { templateId: string } }[];
}

const Ctx = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} });
export const useMe = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      /* shown by the pages that need it */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <Ctx.Provider value={{ me, refresh }}>
      {/* interface sounds are off by default */}
      <SoundProvider enabled={false}>
        <TooltipProvider>
          <TelegramBridge onLogin={refresh} />
          {children}
          <Toaster position="top-center" />
        </TooltipProvider>
      </SoundProvider>
    </Ctx.Provider>
  );
}
