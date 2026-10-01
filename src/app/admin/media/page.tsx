"use client";
/**
 * One-time media import for a deployed instance: upload the licensed source
 * video(s), the server cuts the fragment and prepares everything on its
 * volume. Protected by ADMIN_TOKEN.
 */
import { useEffect, useState } from "react";

export default function MediaAdmin() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/media").then((r) => r.json()).then((j) => setReady(Boolean(j.ready)), () => setReady(null));
  }, [busy]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setStatus("Uploading and processing… this takes 1–3 minutes, keep this page open.");
    try {
      const res = await fetch("/api/admin/media", { method: "POST", headers: { "x-admin-token": token }, body: new FormData(e.currentTarget) });
      const j = await res.json().catch(() => ({}));
      setStatus(res.ok ? `Done: ${j.log?.join(", ")}. Open the meme page — it updates within a minute.` : `Error ${res.status}: ${j.error ?? "unknown"}`);
    } catch {
      setStatus("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-5 px-5 py-14">
      <h1 className="text-[26px] font-semibold">Hotel Lobby media</h1>
      <p className="text-sm text-muted">
        Status: {ready === null ? "…" : ready ? "media in place" : "not imported yet"}. Upload the horizontal COLORS video (the fragment 14.04–29.04 s is cut automatically) and, optionally, the vertical edit for phones.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Admin token
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required className="h-11 rounded-xl border border-line bg-white/[0.05] px-3.5" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Horizontal video (16:9)
          <input type="file" name="horizontal" accept="video/mp4" required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Vertical video (9:16, optional)
          <input type="file" name="vertical" accept="video/mp4" />
        </label>
        <button disabled={busy} className="h-12 rounded-[14px] bg-[#f5f5f7] font-medium text-[#0b0b0d] hover:bg-[#dedee3] disabled:opacity-40">
          {busy ? "Processing…" : "Upload and import"}
        </button>
      </form>
      {status && <p className="rounded-xl border border-line bg-white/[0.03] p-3 text-sm text-fg-2">{status}</p>}
    </main>
  );
}
