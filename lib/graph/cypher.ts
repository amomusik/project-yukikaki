import type { Statement } from "./client";

/**
 * Pure Cypher builders. Every write is an idempotent MERGE so syncs can be
 * replayed safely; `pnpm graph:rebuild` replays everything from Neon.
 */

export type BriefGraphInput = {
  id: string;
  titleEn: string;
  titleJa: string;
  status: string;
  industry: string;
  skills: string[];
  business: { id: string; name: string; ward: string | null };
  city: { key: string; name: string };
  datasets: { id: string; title: string; kind: string; level: string | null; cityKey: string | null }[];
  stakeholders: { id: string; name: string }[];
  venues: { id: string; name: string }[];
  funders: { id: string; name: string }[];
  /** Matched public grants (lib/grants) — projected as Funder nodes with source = 'grant'. */
  grants?: { id: string; name: string; provider: string; issuer: string | null; url: string; deadline: string | null; amountMax: number | null }[];
};

export function briefStatements(b: BriefGraphInput): Statement[] {
  const p = { id: b.id };
  return [
    {
      query: `MERGE (c:Challenge {id: $id})
SET c.name = $titleEn, c.titleJa = $titleJa, c.status = $status, c.industry = $industry
MERGE (b:Business {id: $businessId}) SET b.name = $businessName, b.ward = $ward
MERGE (c)-[:POSTED_BY]->(b)
MERGE (city:City {key: $cityKey}) SET city.name = $cityName
MERGE (b)-[:LOCATED_IN]->(city)`,
      params: {
        ...p,
        titleEn: b.titleEn,
        titleJa: b.titleJa,
        status: b.status,
        industry: b.industry,
        businessId: b.business.id,
        businessName: b.business.name,
        ward: b.business.ward,
        cityKey: b.city.key,
        cityName: b.city.name,
      },
    },
    {
      query: `MATCH (c:Challenge {id: $id})
UNWIND $skills AS skill
MERGE (s:Skill {name: skill})
MERGE (c)-[:NEEDS_SKILL]->(s)`,
      params: { ...p, skills: b.skills },
    },
    {
      query: `MATCH (c:Challenge {id: $id})
UNWIND $datasets AS d
MERGE (ds:Dataset {id: d.id}) SET ds.name = d.title, ds.kind = d.kind, ds.level = d.level
MERGE (c)-[:USES_DATA]->(ds)
FOREACH (_ IN CASE WHEN d.cityKey IS NULL THEN [] ELSE [1] END |
  MERGE (dc:City {key: d.cityKey})
  MERGE (ds)-[:FROM_CITY]->(dc))`,
      params: { ...p, datasets: b.datasets },
    },
    {
      query: `MATCH (c:Challenge {id: $id})
UNWIND $items AS e
MERGE (n:Stakeholder {id: e.id}) SET n.name = e.name
MERGE (n)-[:CONCERNED_WITH]->(c)`,
      params: { ...p, items: b.stakeholders },
    },
    {
      query: `MATCH (c:Challenge {id: $id})
UNWIND $items AS e
MERGE (n:Venue {id: e.id}) SET n.name = e.name
MERGE (n)-[:CAN_HOST]->(c)`,
      params: { ...p, items: b.venues },
    },
    {
      query: `MATCH (c:Challenge {id: $id})
UNWIND $items AS e
MERGE (n:Funder {id: e.id}) SET n.name = e.name
MERGE (n)-[:FUNDS]->(c)`,
      params: { ...p, items: b.funders },
    },
    ...(b.grants ? grantStatements(b.id, b.grants) : []),
  ];
}

/** Replace a challenge's grant FUNDS edges (matches are refreshed wholesale). */
export function grantStatements(challengeId: string, grants: NonNullable<BriefGraphInput["grants"]>): Statement[] {
  return [
    {
      query: `MATCH (c:Challenge {id: $id})
OPTIONAL MATCH (f:Funder {source: $source})-[r:FUNDS]->(c)
DELETE r`,
      params: { id: challengeId, source: "grant" },
    },
    {
      query: `MATCH (c:Challenge {id: $id})
UNWIND $items AS g
MERGE (f:Funder {id: g.id})
SET f.name = g.name, f.source = $source, f.provider = g.provider, f.issuer = g.issuer, f.url = g.url,
    f.deadline = g.deadline, f.amountMax = g.amountMax
MERGE (f)-[:FUNDS]->(c)`,
      params: { id: challengeId, source: "grant", items: grants },
    },
  ];
}

export type BuilderGraphInput = { id: string; name: string; skills: string[] };

export function builderStatements(u: BuilderGraphInput): Statement[] {
  return [
    {
      query: `MERGE (u:Builder {id: $id}) SET u.name = $name
WITH u
UNWIND $skills AS skill
MERGE (s:Skill {name: skill})
MERGE (u)-[:HAS_SKILL]->(s)`,
      params: { id: u.id, name: u.name, skills: u.skills },
    },
  ];
}

export type TeamGraphInput = {
  id: string;
  name: string;
  status: string;
  briefId: string;
  leadId: string;
  members: BuilderGraphInput[];
};

export function teamStatements(t: TeamGraphInput): Statement[] {
  return [
    ...t.members.flatMap(builderStatements),
    {
      query: `MERGE (t:Team {id: $id}) SET t.name = $name, t.status = $status
MERGE (c:Challenge {id: $briefId})
MERGE (t)-[:WORKS_ON]->(c)
WITH t
UNWIND $memberIds AS mid
MATCH (u:Builder {id: mid})
MERGE (u)-[:MEMBER_OF]->(t)`,
      params: { id: t.id, name: t.name, status: t.status, briefId: t.briefId, memberIds: t.members.map((m) => m.id) },
    },
    {
      // Exactly one LEADS edge per team, mirroring the DB constraint.
      query: `MATCH (t:Team {id: $id})
OPTIONAL MATCH (:Builder)-[old:LEADS]->(t)
DELETE old
WITH DISTINCT t
MATCH (u:Builder {id: $leadId})
MERGE (u)-[:LEADS]->(t)`,
      params: { id: t.id, leadId: t.leadId },
    },
  ];
}

export type DeliveryGraphInput = { id: string; teamId: string; briefId: string; summaryEn: string };

export function deliveryStatements(d: DeliveryGraphInput): Statement[] {
  return [
    {
      query: `MERGE (d:Delivery {id: $id}) SET d.name = $summary
MERGE (t:Team {id: $teamId})
MERGE (c:Challenge {id: $briefId})
MERGE (t)-[:DELIVERED]->(d)
MERGE (d)-[:SOLVES]->(c)`,
      params: { id: d.id, teamId: d.teamId, briefId: d.briefId, summary: d.summaryEn.slice(0, 120) },
    },
  ];
}

export function cityAnalogStatements(pairs: { from: { key: string; name: string }; to: { key: string; name: string } }[]): Statement[] {
  return [
    {
      query: `UNWIND $pairs AS p
MERGE (a:City {key: p.fromKey}) SET a.name = p.fromName
MERGE (b:City {key: p.toKey}) SET b.name = p.toName
MERGE (a)-[:ANALOG_OF]->(b)`,
      params: {
        pairs: pairs.map((p) => ({ fromKey: p.from.key, fromName: p.from.name, toKey: p.to.key, toName: p.to.name })),
      },
    },
  ];
}

export const WIPE: Statement = { query: "MATCH (n) DETACH DELETE n", params: {} };
