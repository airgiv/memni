"use client";
import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { LOCALES } from "@/i18n/locales";
import { Button } from "@/ui/button";

export function NotFoundBody() {
  const { m, locale } = useI18n();
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-3 px-4 py-24 sm:px-6">
      <h1 className="text-[28px] font-semibold">{m.notFound.title}</h1>
      <p className="text-muted">{m.notFound.body}</p>
      <Button asChild variant="primary" size="md" className="mt-2">
        <Link href={`/${LOCALES[locale].segment}`}>{m.notFound.back}</Link>
      </Button>
    </main>
  );
}
