import { getDb, schema } from "@/lib/db";

export type ServiceName =
  | "clerk"
  | "neon"
  | "neo4j"
  | "elevenlabs"
  | "linkup"
  | "dify"
  | "adaption"
  | "resend"
  | "jgrants";

export class NotConfiguredError extends Error {
  constructor(service: ServiceName) {
    super(`${service} is not configured`);
    this.name = "NotConfiguredError";
  }
}

export async function recordServiceEvent(e: {
  service: ServiceName;
  operation: string;
  ok: boolean;
  latencyMs: number;
  error?: string | null;
}): Promise<void> {
  try {
    await getDb()
      .insert(schema.serviceEvents)
      .values({ ...e, error: e.error ?? null });
  } catch {
    // Logging must never break the flow.
  }
}

export type GuardResult<T> = { value: T; ok: boolean; fellBack: boolean; error?: string };

/**
 * Run an integration call with a timeout. On any failure (including "not configured")
 * return the fallback instead of throwing, and log a service_events row either way.
 */
export async function withFallback<T>(
  service: ServiceName,
  operation: string,
  fn: (signal: AbortSignal) => Promise<T>,
  fallback: T | (() => T | Promise<T>),
  opts: { timeoutMs?: number } = {},
): Promise<GuardResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const started = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    await recordServiceEvent({ service, operation, ok: true, latencyMs: Date.now() - started });
    return { value, ok: true, fellBack: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordServiceEvent({ service, operation, ok: false, latencyMs: Date.now() - started, error: message });
    const value =
      typeof fallback === "function" ? await (fallback as () => T | Promise<T>)() : (fallback as T);
    return { value, ok: false, fellBack: true, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Small fetch helper that throws on non-2xx with the response body for diagnostics. */
export async function fetchJson<T = unknown>(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}
