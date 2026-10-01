"use client";
import { Toaster } from "sonner";
import { I18nProvider } from "@/i18n/client";
import type { LocaleCode } from "@/i18n/locales";
import type { Messages } from "@/i18n/messages/en";
import { TelegramBridge } from "./TelegramBridge";

export function Providers({ locale, messages, children }: { locale: LocaleCode; messages: Messages; children: React.ReactNode }) {
  return (
    <I18nProvider locale={locale} messages={messages}>
      {children}
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{ className: "!bg-surface-2 !border-line !text-fg !rounded-xl !text-[14px]" }}
        offset={{ top: "calc(var(--safe-top) + 12px)" }}
      />
      <TelegramBridge onLogin={() => undefined} />
    </I18nProvider>
  );
}
