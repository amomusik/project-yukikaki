import { describe, expect, it } from "vitest";
import { logFingerprint, NONCE_TTL_MS, nonceFromConversation, signInterviewNonce, verifyInterviewNonce } from "@/lib/interview-nonce";

const now = 1_800_000_000_000;

describe("interview/impact ownership nonce", () => {
  it("round-trips the bound identity", () => {
    const n = signInterviewNonce({ kind: "interview", userId: "u1", businessId: "b1" }, now);
    expect(verifyInterviewNonce(n, { now })).toEqual({ kind: "interview", userId: "u1", businessId: "b1", deliveryId: null, exp: now + NONCE_TTL_MS });
    const i = signInterviewNonce({ kind: "impact", userId: null, deliveryId: "d1" }, now);
    expect(verifyInterviewNonce(i, { now, kind: "impact" })).toMatchObject({ kind: "impact", deliveryId: "d1" });
  });

  it("expires after about 2 hours", () => {
    const n = signInterviewNonce({ kind: "interview", userId: "u1" }, now);
    expect(NONCE_TTL_MS).toBe(2 * 60 * 60 * 1000);
    expect(verifyInterviewNonce(n, { now: now + NONCE_TTL_MS - 1 })).not.toBeNull();
    expect(verifyInterviewNonce(n, { now: now + NONCE_TTL_MS + 1 })).toBeNull();
  });

  it("rejects tampered payloads and signatures", () => {
    const n = signInterviewNonce({ kind: "interview", userId: "u1", businessId: "b1" }, now);
    const [body, sig] = n.split(".");
    const forged = Buffer.from(JSON.stringify({ kind: "interview", userId: "attacker", businessId: "b1", exp: now + NONCE_TTL_MS })).toString("base64url");
    expect(verifyInterviewNonce(`${forged}.${sig}`, { now })).toBeNull();
    expect(verifyInterviewNonce(`${body}.${sig.slice(0, -2)}xx`, { now })).toBeNull();
    expect(verifyInterviewNonce(`${body}.`, { now })).toBeNull();
    expect(verifyInterviewNonce(`${n}.extra`, { now })).toBeNull();
    expect(verifyInterviewNonce("", { now })).toBeNull();
    expect(verifyInterviewNonce(undefined, { now })).toBeNull();
    expect(verifyInterviewNonce(42, { now })).toBeNull();
  });

  it("rejects a nonce of the wrong kind", () => {
    const i = signInterviewNonce({ kind: "impact", userId: null, deliveryId: "d1" }, now);
    expect(verifyInterviewNonce(i, { now, kind: "interview" })).toBeNull();
    expect(nonceFromConversation({ dynamicVariables: { yk_nonce: i } }, "interview", now)).toBeNull();
    expect(nonceFromConversation({ dynamicVariables: { yk_nonce: i } }, "impact", now)).toMatchObject({ deliveryId: "d1" });
    expect(nonceFromConversation({ dynamicVariables: { user_id: "u1" } }, "interview", now)).toBeNull();
  });

  it("fingerprints secrets for logs without revealing them", () => {
    const fp = logFingerprint("secret-token-value");
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect("secret-token-value").not.toContain(fp);
  });
});
