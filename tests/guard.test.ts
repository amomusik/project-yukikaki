import { desc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { withFallback } from "@/lib/integrations/_guard";

const lastEvent = async () =>
  (await getDb().select().from(schema.serviceEvents).orderBy(desc(schema.serviceEvents.createdAt)).limit(1))[0];

describe("withFallback", () => {
  it("returns the value and logs ok", async () => {
    const r = await withFallback("linkup", "ok-op", async () => 42, 0);
    expect(r).toMatchObject({ value: 42, ok: true, fellBack: false });
    expect(await lastEvent()).toMatchObject({ service: "linkup", operation: "ok-op", ok: true });
  });

  it("returns the fallback on throw and logs the error", async () => {
    const r = await withFallback("dify", "boom", async () => {
      throw new Error("kaboom");
    }, "fallback");
    expect(r).toMatchObject({ value: "fallback", ok: false, fellBack: true, error: "kaboom" });
    expect(await lastEvent()).toMatchObject({ service: "dify", ok: false, error: "kaboom" });
  });

  it("returns the fallback on timeout and aborts the call", async () => {
    let aborted = false;
    const r = await withFallback(
      "adaption",
      "slow",
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => (aborted = true));
          setTimeout(() => resolve("late"), 1_000);
        }),
      () => "fallback-fn",
      { timeoutMs: 50 },
    );
    expect(r.value).toBe("fallback-fn");
    expect(r.error).toMatch(/timeout/);
    expect(aborted).toBe(true);
  });
});
