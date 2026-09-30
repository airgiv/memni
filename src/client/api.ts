"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз", 0, "network");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) throw new ApiError(data?.error ?? `Ошибка ${res.status}`, res.status, data?.code);
  return data as T;
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function previewsLeftText(left: number) {
  if (left <= 0) return "Бесплатные превью закончились";
  return `Осталось ${left} ${plural(left, "бесплатное превью", "бесплатных превью", "бесплатных превью")}`;
}

export function formatPrice(price: { amountMinor: number; currency: string; isExample: boolean } | null): string {
  if (!price) return "Цена не определена";
  const amount = price.currency === "XTR" ? `${price.amountMinor} ⭐` : `${Math.round(price.amountMinor / 100)} ₽`;
  return price.isExample ? `${amount} — пример цены` : amount;
}
