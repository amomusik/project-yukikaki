import { describe, expect, it } from "vitest";
import { briefStatements, cityAnalogStatements, deliveryStatements, teamStatements } from "@/lib/graph/cypher";

const all = [
  ...briefStatements({
    id: "c1",
    titleEn: "t",
    titleJa: "t",
    status: "approved",
    industry: "ramen",
    skills: ["line-bot"],
    business: { id: "b1", name: "Menya", ward: null },
    city: { key: "sapporo", name: "Sapporo" },
    datasets: [{ id: "d1", title: "x", kind: "live", level: "exact", cityKey: "sapporo" }],
    stakeholders: [{ id: "s1", name: "Ward office" }],
    venues: [{ id: "v1", name: "Library" }],
    funders: [{ id: "f1", name: "Bank" }],
  }),
  ...teamStatements({ id: "t1", name: "T", status: "approved", briefId: "c1", leadId: "u1", members: [{ id: "u1", name: "A", skills: ["line-bot"] }] }),
  ...deliveryStatements({ id: "del1", teamId: "t1", briefId: "c1", summaryEn: "done" }),
  ...cityAnalogStatements([{ from: { key: "sapporo", name: "Sapporo" }, to: { key: "asahikawa", name: "Asahikawa" } }]),
];
const cypher = all.map((s) => s.query).join("\n");

describe("Cypher builders", () => {
  it.each(["Challenge", "Business", "City", "Skill", "Dataset", "Stakeholder", "Venue", "Funder", "Builder", "Team", "Delivery"])(
    "MERGEs node %s",
    (label) => expect(cypher).toMatch(new RegExp(`MERGE \\(\\w+:${label} \\{`)),
  );

  it.each([
    "POSTED_BY", "LOCATED_IN", "NEEDS_SKILL", "USES_DATA", "FROM_CITY", "CONCERNED_WITH", "CAN_HOST", "FUNDS",
    "HAS_SKILL", "MEMBER_OF", "WORKS_ON", "LEADS", "DELIVERED", "SOLVES", "ANALOG_OF",
  ])("MERGEs relationship %s", (rel) => expect(cypher).toMatch(new RegExp(`MERGE \\([^)]*\\)-\\[:${rel}\\]->`)));

  it("never uses CREATE (all writes are idempotent) and passes values as parameters", () => {
    expect(cypher).not.toMatch(/\bCREATE\b/);
    expect(cypher).not.toContain("Menya");
  });
});
