"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SoundProvider, Toaster, TooltipProvider } from "@/ui/rapui";
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
          <Toaster
            position="top-center"
            theme="dark"
            // rapui toasts are ink slabs, which is near-white on the dark palette
            toastOptions={{
              classNames: {
                toast: "bg-paper-3 text-ink shadow-[0_0_0_1px_var(--rap-line),var(--rap-shadow-pop)]",
                description: "text-mute",
                actionButton: "bg-accent text-accent-ink hover:bg-accent",
              },
            }}
          />
        </TooltipProvider>
      </SoundProvider>
    </Ctx.Provider>
  );
}
