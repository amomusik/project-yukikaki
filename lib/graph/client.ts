import neo4j, { type Driver } from "neo4j-driver";
import { configured, env } from "@/lib/env";
import { NotConfiguredError } from "@/lib/integrations/_guard";

const g = globalThis as unknown as { __ykNeo4j?: Driver };

export function getDriver(): Driver {
  if (!configured.neo4j()) throw new NotConfiguredError("neo4j");
  if (!g.__ykNeo4j) {
    g.__ykNeo4j = neo4j.driver(env.NEO4J_URI!, neo4j.auth.basic(env.NEO4J_USERNAME!, env.NEO4J_PASSWORD!), {
      connectionTimeout: 8_000,
      disableLosslessIntegers: true,
    });
  }
  return g.__ykNeo4j;
}

export type Statement = { query: string; params: Record<string, unknown> };

export async function runWrite(statements: Statement[]): Promise<void> {
  const session = getDriver().session();
  try {
    await session.executeWrite(async (tx) => {
      for (const s of statements) await tx.run(s.query, s.params);
    });
  } finally {
    await session.close();
  }
}

export async function runRead<T = Record<string, unknown>>(query: string, params: Record<string, unknown> = {}) {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const res = await session.run(query, params);
    return res.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

export async function closeDriver() {
  await g.__ykNeo4j?.close();
  g.__ykNeo4j = undefined;
}
