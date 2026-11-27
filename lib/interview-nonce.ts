import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { feedbackSecret } from "@/lib/env";
import type { ParsedConversation } from "@/lib/integrations/elevenlabs";

/**
 * Server-bound ownership for ElevenLabs conversations.
 *
 * The browser can edit any dynamic variable before `startSession`, so ownership is never read
 * from `user_id` / `business_id` / `delivery_id`. Instead the signed-url route issues a short-lived
 * HMAC nonce (FEEDBACK_TOKEN_SECRET) binding the identity it verified server-side; the client passes
 * only `yk_nonce`, and ingestion verifies it and takes ownership from the nonce payload.
 */
export const NONCE_VAR = "yk_nonce";
export const NONCE_TTL_MS = 2 * 60 * 60 * 1000;

export type NonceKind = "interview" | "impact";
export type NoncePayload = {
  kind: NonceKind;
  /** users.id of the signed-in caller (interview). Null for impact (authorised by feedback token). */
  userId: string | null;
  businessId?: string | null;
  deliveryId?: string | null;
  /** Expiry, ms since epoch. */
  exp: number;
};

const mac = (body: string) => createHmac("sha256", `yk-nonce:${feedbackSecret()}`).update(body).digest("base64url");

export function signInterviewNonce(
  p: { kind: NonceKind; userId: string | null; businessId?: string | null; deliveryId?: string | null },
  now = Date.now(),
  ttlMs = NONCE_TTL_MS,
): string {
  const payload: NoncePayload = {
    kind: p.kind,
    userId: p.userId ?? null,
    businessId: p.businessId ?? null,
    deliveryId: p.deliveryId ?? null,
    exp: now + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** Returns the payload if the signature is valid, the nonce is unexpired and (optionally) of the expected kind. */
export function verifyInterviewNonce(nonce: unknown, opts: { kind?: NonceKind; now?: number } = {}): NoncePayload | null {
  if (typeof nonce !== "string" || nonce.length > 2000) return null;
  const [body, sig, extra] = nonce.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const a = Buffer.from(mac(body));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let p: NoncePayload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!p || (p.kind !== "interview" && p.kind !== "impact") || typeof p.exp !== "number") return null;
  if (p.exp < (opts.now ?? Date.now())) return null;
  if (opts.kind && p.kind !== opts.kind) return null;
  return p;
}

/** Verify the `yk_nonce` dynamic variable of an ElevenLabs conversation. */
export function nonceFromConversation(conv: Pick<ParsedConversation, "dynamicVariables">, kind: NonceKind, now?: number) {
  return verifyInterviewNonce(conv.dynamicVariables?.[NONCE_VAR], { kind, now });
}

/** Short, non-reversible fingerprint for logs (never log raw tokens or links). */
export const logFingerprint = (secret: string) => createHash("sha256").update(secret).digest("hex").slice(0, 8);
