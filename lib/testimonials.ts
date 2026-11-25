import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type Testimonial = {
  id: string;
  quote: string;
  businessName: string;
  city: string;
  industry: string;
  hoursSavedPerWeek: number;
  satisfaction: number;
  /** True when the brief comes from synthetic seed data; the UI must label it. */
  isDemo: boolean;
};

/**
 * Real impact-review quotes, as the business owner gave them (evaluations.impact_summary.quote).
 * Nothing is paraphrased or translated here; rows without a quote are skipped.
 * Returns [] when the database is unavailable so the landing page simply hides the section.
 */
export async function listTestimonials(limit = 6): Promise<Testimonial[]> {
  try {
    const rows = await getDb()
      .select({ evaluation: schema.evaluations, brief: schema.briefs, business: schema.businesses })
      .from(schema.evaluations)
      .innerJoin(schema.deliveries, eq(schema.evaluations.deliveryId, schema.deliveries.id))
      .innerJoin(schema.briefs, eq(schema.deliveries.briefId, schema.briefs.id))
      .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
      .orderBy(desc(schema.evaluations.submittedAt))
      .limit(limit * 3);
    return rows
      .map(({ evaluation, brief, business }) => {
        const raw = evaluation.impactSummary?.quote;
        const quote = typeof raw === "string" ? raw.trim() : "";
        return {
          id: evaluation.id,
          quote,
          businessName: business.name,
          city: business.city,
          industry: business.industry,
          hoursSavedPerWeek: Number(evaluation.hoursSavedPerWeek ?? 0),
          satisfaction: Math.max(0, Math.min(5, Math.round(evaluation.satisfaction))),
          isDemo: brief.isSynthetic,
        };
      })
      .filter((t) => t.quote.length > 0)
      .slice(0, limit);
  } catch {
    return [];
  }
}
