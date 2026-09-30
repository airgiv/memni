/**
 * Private file storage. Local mode keeps files under .data/files; Supabase mode
 * uses a private bucket. Files are never public: the browser gets them through
 * /api/files/* which checks ownership first, then streams (local) or redirects
 * to a short-lived signed URL (Supabase).
 */
import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { getConfig } from "../../config";
import { getSupabaseAdmin } from "../supabase";

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(keys: string[]): Promise<void>;
  /** A URL a third party (a model provider) can fetch for a limited time, if supported. */
  signedUrl(key: string, expiresSec: number): Promise<string | null>;
  exists(key: string): Promise<boolean>;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private path(key: string) {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root) + sep)) throw new Error("bad storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async remove(keys: string[]) {
    await Promise.all(keys.map((k) => rm(this.path(k), { force: true })));
  }
  async signedUrl() {
    // local files are not reachable from the internet
    return null;
  }
  async exists(key: string) {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
}

class SupabaseStorage implements Storage {
  constructor(private bucket: string) {}
  private get client() {
    return getSupabaseAdmin().storage.from(this.bucket);
  }
  async put(key: string, data: Buffer, contentType: string) {
    const { error } = await this.client.upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  }
  async get(key: string) {
    const { data, error } = await this.client.download(key);
    if (error || !data) throw new Error(`storage download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(keys: string[]) {
    if (keys.length === 0) return;
    const { error } = await this.client.remove(keys);
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }
  async signedUrl(key: string, expiresSec: number) {
    const { data, error } = await this.client.createSignedUrl(key, expiresSec);
    if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
    return data.signedUrl;
  }
  async exists(key: string) {
    const slash = key.lastIndexOf("/");
    const { data } = await this.client.list(key.slice(0, slash), { search: key.slice(slash + 1) });
    return Boolean(data?.length);
  }
}

let instance: Storage | null = null;
export function getStorage(): Storage {
  if (instance) return instance;
  const c = getConfig();
  instance = c.dataMode === "supabase" ? new SupabaseStorage(c.supabase.bucket) : new LocalStorage(join(c.dataDir, "files"));
  return instance;
}

export const keys = {
  photo: (userId: string, id: string, ext: string) => `u/${userId}/photos/${id}.${ext}`,
  preview: (userId: string, id: string, ext: string) => `u/${userId}/previews/${id}.${ext}`,
  result: (userId: string, jobId: string) => `u/${userId}/results/${jobId}.mp4`,
  poster: (userId: string, jobId: string) => `u/${userId}/results/${jobId}.jpg`,
  raw: (userId: string, jobId: string, attempt: number) => `u/${userId}/results/${jobId}.raw${attempt}.mp4`,
};
