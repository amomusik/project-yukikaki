import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";

describe("isUuid", () => {
  it("accepts canonical UUIDs in any case", () => {
    expect(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(isUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(true);
    expect(isUuid(crypto.randomUUID())).toBe(true);
  });

  it("rejects anything Postgres would choke on", () => {
    for (const v of ["does-not-exist", "", "123", "3f2504e0-4f89-11d3-9a0c-0305e82c330", "3f2504e0-4f89-11d3-9a0c-0305e82c3301x", " 3f2504e0-4f89-11d3-9a0c-0305e82c3301", "'; drop table briefs; --", undefined, null, 42])
      expect(isUuid(v)).toBe(false);
  });
});
