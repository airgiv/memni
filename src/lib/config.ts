/**
 * Server configuration. Everything is read from environment variables; nothing
 * secret ever reaches the browser. The app picks its mode per integration:
 *
 *  - data:  "supabase" when SUPABASE_URL + keys are set, otherwise "local"
 *           (SQLite + files under .data/, demo only)
 *  - image: "gemini" when GEMINI_API_KEY is set and IMAGE_PROVIDER != demo
 *  - video: "kling" when KLING_ACCESS_KEY/SECRET are set and VIDEO_PROVIDER != demo
 *  - photo checks: "gemini" when PHOTO_ANALYZER=gemini and a key is set, else local pixel checks
 *  - payments: PAYMENT_PROVIDER (only the "test" adapter exists)
 *
 * The UI shows the "demo" badge whenever any generation path is a demo adapter.
 */

function str(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}
function int(name: string, fallback: number): number {
  const v = str(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function num(name: string, fallback: number): number {
  const v = str(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type DataMode = "local" | "supabase";
export type ImageMode = "demo" | "gemini";
export type VideoMode = "demo" | "kling" | "genjutsu";

export function getConfig() {
  const supabaseUrl = str("SUPABASE_URL") ?? str("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = str("SUPABASE_ANON_KEY") ?? str("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabaseServiceKey = str("SUPABASE_SERVICE_ROLE_KEY");
  const dataMode: DataMode =
    str("DATA_BACKEND") === "local" || !(supabaseUrl && supabaseAnonKey && supabaseServiceKey) ? "local" : "supabase";

  const geminiKey = str("GEMINI_API_KEY");
  const imageMode: ImageMode = str("IMAGE_PROVIDER") !== "demo" && geminiKey ? "gemini" : "demo";

  const analysisMode: "local" | "gemini" = str("PHOTO_ANALYZER") === "gemini" && geminiKey ? "gemini" : "local";

  const klingAk = str("KLING_ACCESS_KEY");
  const klingSk = str("KLING_SECRET_KEY");
  const requestedVideo = str("VIDEO_PROVIDER") ?? "kling";
  const videoMode: VideoMode =
    requestedVideo === "kling" && klingAk && klingSk
      ? "kling"
      : requestedVideo === "genjutsu" && str("GENJUTSU_API_KEY")
        ? "genjutsu"
        : "demo";

  return {
    appUrl: str("APP_URL") ?? "http://localhost:3000",
    dataMode,
    imageMode,
    videoMode,
    analysisMode,
    /** true when at least one step would show an example instead of a real generation */
    isDemo: imageMode === "demo" || videoMode === "demo",
    sessionSecret: str("SESSION_SECRET"),
    dataDir: str("LOCAL_DATA_DIR") ?? ".data",

    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceKey: supabaseServiceKey,
      bucket: str("SUPABASE_BUCKET") ?? "memni-private",
    },

    gemini: {
      apiKey: geminiKey,
      model: str("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-image",
      /** text+vision model used by the optional photo checker (PHOTO_ANALYZER=gemini) */
      analysisModel: str("GEMINI_ANALYSIS_MODEL") ?? "gemini-3.1-flash",
      /** estimated cost of one output image, USD — used for the ledger until the bill is known */
      estimatedCostUsd: num("GEMINI_IMAGE_COST_USD", 0.067),
      timeoutMs: int("GEMINI_TIMEOUT_MS", 90_000),
    },

    kling: {
      accessKey: klingAk,
      secretKey: klingSk,
      baseUrl: str("KLING_BASE_URL") ?? "https://api-singapore.klingai.com",
      model: str("KLING_MODEL") ?? "kling-v2-6",
      mode: (str("KLING_MODE") ?? "std") as "std" | "pro",
      /** estimated USD per generated second, for the ledger */
      estimatedCostUsdPerSec: num("KLING_COST_USD_PER_SEC", 0.07),
      webhookSecret: str("KLING_WEBHOOK_SECRET"),
    },

    genjutsu: {
      apiKey: str("GENJUTSU_API_KEY"),
      baseUrl: str("GENJUTSU_BASE_URL"),
    },

    limits: {
      /** scene previews a user gets free (the "first preview free" offer); later ones are paid */
      freePreviewsPerUser: int("FREE_PREVIEWS_PER_USER", 1),
      /** video jobs one user may have in flight */
      maxActiveJobsPerUser: int("MAX_ACTIVE_JOBS_PER_USER", 1),
      /** video jobs in flight across the whole service */
      maxActiveJobsGlobal: int("MAX_ACTIVE_JOBS_GLOBAL", 3),
      /** provider submissions allowed per job (first try + manual retries) */
      maxVideoAttemptsPerJob: int("MAX_VIDEO_ATTEMPTS_PER_JOB", 2),
      /** video jobs a user may start per day */
      maxJobsPerUserPerDay: int("MAX_JOBS_PER_USER_PER_DAY", 5),
      maxPhotoBytes: int("MAX_PHOTO_BYTES", 12 * 1024 * 1024),
      /** longest accepted difference between generated video and the original audio, seconds */
      durationToleranceSec: num("DURATION_TOLERANCE_SEC", 0.35),
    },

    telegram: {
      botToken: str("TELEGRAM_BOT_TOKEN"),
      /** max age of initData, seconds */
      initDataMaxAge: int("TELEGRAM_INITDATA_MAX_AGE", 24 * 3600),
    },

    payments: {
      /** server-selected payment adapter; only "test" exists — nothing is charged */
      provider: str("PAYMENT_PROVIDER") ?? "test",
    },

    pricing: {
      /** prices are placeholders until cost and seller countries are known */
      areExamples: str("PRICES_ARE_EXAMPLES") !== "false",
      /** fallback billing country when the request carries none (ISO 3166-1 alpha-2) */
      defaultCountry: (str("DEFAULT_BILLING_COUNTRY") ?? "US").toUpperCase(),
    },
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

/** What the browser is allowed to know about the configuration. */
export function publicConfig() {
  const c = getConfig();
  return {
    dataMode: c.dataMode,
    imageMode: c.imageMode,
    videoMode: c.videoMode,
    isDemo: c.isDemo,
    telegramConfigured: Boolean(c.telegram.botToken),
    paymentProvider: c.payments.provider,
  };
}
export type PublicConfig = ReturnType<typeof publicConfig>;
