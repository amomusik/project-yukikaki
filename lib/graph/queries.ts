import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { withFallback } from "@/lib/integrations/_guard";
import { runRead } from "./client";

export type GraphNode = { id: string; label: string; name: string };
export type GraphLink = { source: string; target: string; type: string };
export type GraphData = { nodes: GraphNode[]; links: GraphLink[]; available: boolean };

type Rec = {
  a: { elementId: string; labels: string[]; properties: Record<string, unknown> };
  r: { type: string };
  b: { elementId: string; labels: string[]; properties: Record<string, unknown> };
};

function toGraph(records: Rec[]): Omit<GraphData, "available"> {
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const node = (n: Rec["a"]) => {
    if (!nodes.has(n.elementId)) {
      const p = n.properties;
      nodes.set(n.elementId, {
        id: n.elementId,
        label: n.labels[0] ?? "Node",
        name: String(p.name ?? p.key ?? p.id ?? ""),
      });
    }
    return n.elementId;
  };
  for (const rec of records) links.push({ source: node(rec.a), target: node(rec.b), type: rec.r.type });
  return { nodes: [...nodes.values()], links };
}

const EMPTY: GraphData = { nodes: [], links: [], available: false };

/** Challenge plus everything within two hops (business, data, skills, builders, teams, venues…). */
export async function challengeNeighborhood(briefId: string): Promise<GraphData> {
  const r = await withFallback(
    "neo4j",
    "challengeNeighborhood",
    async () =>
      toGraph(
        await runRead<Rec>(
          `MATCH (c:Challenge {id: $id})
MATCH p = (c)-[*1..2]-()
WHERE NONE(rel IN relationships(p) WHERE type(rel) = 'ANALOG_OF')
UNWIND relationships(p) AS rel
WITH DISTINCT rel
RETURN startNode(rel) AS a, rel AS r, endNode(rel) AS b
LIMIT 300`,
          { id: briefId },
        ),
      ),
    null,
    { timeoutMs: 8_000 },
  );
  return r.value ? { ...r.value, available: true } : EMPTY;
}

export async function fullGraph(): Promise<GraphData> {
  const r = await withFallback(
    "neo4j",
    "fullGraph",
    async () => toGraph(await runRead<Rec>("MATCH (a)-[r]->(b) RETURN a, r, b LIMIT 1500")),
    null,
    { timeoutMs: 8_000 },
  );
  return r.value ? { ...r.value, available: true } : EMPTY;
}

export type SuggestedBuilder = { id: string; name: string; sharedSkills: string[] };

/** Rank students by skills shared with the challenge. Falls back to SQL if Neo4j is down. */
export async function suggestBuilders(briefId: string, limit = 5): Promise<SuggestedBuilder[]> {
  const r = await withFallback(
    "neo4j",
    "suggestBuilders",
    async () =>
      (
        await runRead<{ id: string; name: string; skills: string[] }>(
          `MATCH (c:Challenge {id: $id})-[:NEEDS_SKILL]->(s:Skill)<-[:HAS_SKILL]-(u:Builder)
RETURN u.id AS id, u.name AS name, collect(s.name) AS skills, count(s) AS score
ORDER BY score DESC, name ASC LIMIT toInteger($limit)`,
          { id: briefId, limit },
        )
      ).map((x) => ({ id: x.id, name: x.name, sharedSkills: x.skills })),
    () => suggestBuildersSql(briefId, limit),
    { timeoutMs: 8_000 },
  );
  return r.value;
}

export async function suggestBuildersSql(briefId: string, limit = 5): Promise<SuggestedBuilder[]> {
  const db = getDb();
  const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, briefId));
  if (!brief) return [];
  const need = new Set(brief.skillsNeeded.map((s) => s.toLowerCase()));
  const students = await db.select().from(schema.users).where(eq(schema.users.role, "student"));
  return students
    .map((u) => ({ id: u.id, name: u.displayName, sharedSkills: u.skills.filter((s) => need.has(s.toLowerCase())) }))
    .filter((u) => u.sharedSkills.length > 0)
    .sort((a, b) => b.sharedSkills.length - a.sharedSkills.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}
