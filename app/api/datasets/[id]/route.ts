import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { hasSynthetic, readSynthetic, toCsv } from "@/lib/datasets/store";
import { refreshPendingDataset } from "@/lib/pipeline/brief";

/** Download a synthetic stand-in dataset as JSON (default) or CSV (?format=csv). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("not found", { status: 404 });
  const db = getDb();
  let [ds] = await db.select().from(schema.dataSources).where(eq(schema.dataSources.id, id));
  if (!ds || ds.kind !== "synthetic") return new NextResponse("not found", { status: 404 });
  if (ds.pending && (await refreshPendingDataset(id))) {
    [ds] = await db.select().from(schema.dataSources).where(eq(schema.dataSources.id, id));
  }
  if (ds.pending || !hasSynthetic(ds)) return NextResponse.json({ status: "generating" }, { status: 202 });
  const payload = await readSynthetic(ds);
  if (!payload) return new NextResponse("payload missing", { status: 404 });

  const format = new URL(req.url).searchParams.get("format");
  const filename = `yukikaki-${id.slice(0, 8)}`;
  if (format === "csv") {
    return new NextResponse("\uFEFF" + toCsv(payload.rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"` },
    });
  }
  return NextResponse.json(
    { synthetic: true, notice: "Synthetic, fictional example data grounded on the listed sources.", ...payload },
    { headers: { "Content-Disposition": `inline; filename="${filename}.json"` } },
  );
}
