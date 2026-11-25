import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/lib/db";
import { hasSynthetic, readSynthetic, saveSynthetic, toCsv, type SyntheticPayload } from "@/lib/datasets/store";
import { makeBrief } from "./helpers";

vi.mock("@/lib/integrations/adaption", async (orig) => ({
  ...(await orig<typeof import("@/lib/integrations/adaption")>()),
  waitForRows: vi.fn(async () => [{ prompt: "late", completion: "rows" }]),
}));

const payload: SyntheticPayload = {
  name: "yukikaki:ramen:sapporo",
  generatedBy: "adaption",
  externalId: "ds_1",
  groundedOn: [{ title: "Sapporo stats", url: "https://city.sapporo.jp/x" }],
  rows: [{ prompt: "予約できますか？", completion: "はい、\"承りました\"。" }],
};

async function makeSynthetic(over: Partial<typeof schema.dataSources.$inferInsert> = {}) {
  const { brief } = await makeBrief("draft");
  const [ds] = await getDb()
    .insert(schema.dataSources)
    .values({ briefId: brief.id, kind: "synthetic", provider: "adaption", title: "Adaption Labs: x", ...over })
    .returning();
  return ds;
}
const reload = async (id: string) => (await getDb().select().from(schema.dataSources).where(eq(schema.dataSources.id, id)))[0];
const get = async (id: string, qs = "") => {
  const { GET } = await import("@/app/api/datasets/[id]/route");
  return GET(new Request(`http://localhost/api/datasets/${id}${qs}`), { params: Promise.resolve({ id }) });
};

describe("synthetic dataset storage (DB-backed)", () => {
  it("saveSynthetic stores the payload in data_sources.payload, never on disk", async () => {
    const ds = await makeSynthetic({ payloadPath: "data/synthetic/legacy.json" });
    await saveSynthetic(ds.id, payload);
    const row = await reload(ds.id);
    expect(row.payload).toEqual(payload);
    expect(row.payloadPath).toBeNull();
    expect(existsSync(path.join(process.cwd(), "data", "synthetic", `${ds.id}.json`))).toBe(false);
    expect(hasSynthetic(row)).toBe(true);
    expect(await readSynthetic(row)).toEqual(payload);
  });

  it("saveSynthetic can update extra columns atomically (pending → done)", async () => {
    const ds = await makeSynthetic({ pending: true, snippet: "Generating…" });
    await saveSynthetic(ds.id, payload, { pending: false, snippet: "1 example rows" });
    expect(await reload(ds.id)).toMatchObject({ pending: false, snippet: "1 example rows", payload });
  });

  it("readSynthetic returns null without a payload and falls back to legacy files inside the project only", async () => {
    expect(await readSynthetic({ payload: null, payloadPath: null })).toBeNull();
    expect(await readSynthetic({ payload: null, payloadPath: "../../etc/passwd" })).toBeNull();
    const dir = mkdtempSync(path.join(process.cwd(), ".yk-legacy-"));
    const file = path.join(dir, "p.json");
    writeFileSync(file, JSON.stringify(payload));
    expect(await readSynthetic({ payload: null, payloadPath: path.relative(process.cwd(), file) })).toEqual(payload);
    (await import("node:fs")).rmSync(dir, { recursive: true, force: true });
  });

  it("toCsv escapes quotes", () => {
    expect(toCsv(payload.rows)).toBe('prompt,completion\n"予約できますか？","はい、""承りました""。"');
  });
});

describe("GET /api/datasets/[id]", () => {
  it("serves the DB payload as JSON and CSV", async () => {
    const ds = await makeSynthetic();
    await saveSynthetic(ds.id, payload);
    const json = await (await get(ds.id)).json();
    expect(json).toMatchObject({ synthetic: true, name: payload.name, rows: payload.rows });
    const csv = await get(ds.id, "?format=csv");
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(await csv.text()).toContain("予約できますか？");
  });

  it("returns 202 while generating and 404 for unknown ids", async () => {
    const ds = await makeSynthetic();
    expect((await get(ds.id)).status).toBe(202);
    expect((await get("00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  it("lazily finishes a pending Adaption dataset into the DB", async () => {
    const ds = await makeSynthetic({ pending: true, externalId: "ds_pending" });
    const res = await get(ds.id);
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toEqual([{ prompt: "late", completion: "rows" }]);
    const row = await reload(ds.id);
    expect(row).toMatchObject({ pending: false, snippet: "1 example rows", payloadPath: null });
    expect(row.payload?.externalId).toBe("ds_pending");
  });
});
