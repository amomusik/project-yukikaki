import { getTranslations } from "next-intl/server";
import type { AiReview, BriefStatus, DataSource, GroundingLevel, TeamStatus } from "@/lib/db/schema";
import { Badge } from "./ui";

const statusTone: Record<string, "slate" | "sky" | "green" | "amber" | "rose" | "violet"> = {
  draft: "slate",
  enriching: "amber",
  in_review: "amber",
  pending: "amber",
  approved: "sky",
  rejected: "rose",
  in_progress: "violet",
  delivered: "green",
  evaluated: "green",
};

export async function StatusBadge({ status }: { status: BriefStatus | TeamStatus }) {
  const t = await getTranslations("status");
  return <Badge tone={statusTone[status]}>{t(status)}</Badge>;
}

export async function GroundingBadge({ level, city }: { level: GroundingLevel | null; city?: string | null }) {
  if (!level) return null;
  const t = await getTranslations("grounding");
  const tone = level === "exact" ? "green" : level === "ungrounded" ? "rose" : level === "analog" ? "sky" : "slate";
  const label = level === "analog" ? (city ? t("analog", { city }) : t("analogNoCity")) : t(level);
  return <Badge tone={tone}>{label}</Badge>;
}

export async function SourceBadge({ source }: { source: DataSource }) {
  const t = await getTranslations("grounding");
  if (source.kind === "synthetic") {
    return (
      <span className="flex flex-wrap gap-1">
        <Badge tone="violet">{source.pending ? t("pending") : t("syntheticGrounded", { n: source.groundedOn.length })}</Badge>
        {source.isReference && <Badge tone="amber">{t("reference")}</Badge>}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {source.groundingLevel === "analog" ? (
        <GroundingBadge level="analog" city={source.matchedCity} />
      ) : source.groundingLevel === "national" ? (
        <GroundingBadge level="national" />
      ) : (
        <Badge tone="green">{t("live")}</Badge>
      )}
      {source.isReference && <Badge tone="amber">{t("reference")}</Badge>}
    </span>
  );
}

export async function AiBadge({ review }: { review: AiReview | null }) {
  const t = await getTranslations("ai");
  if (!review || !review.recommendation) return <Badge tone="slate">{t("unavailable")}</Badge>;
  const tone = review.recommendation === "approve" ? "green" : review.recommendation === "revise" ? "amber" : "rose";
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge tone={tone}>{t(review.recommendation)}</Badge>
      {typeof review.score === "number" && (
        <Badge tone="slate">
          {t("score")} {review.score}
        </Badge>
      )}
      {review.pii_found && <Badge tone="rose">{t("pii")}</Badge>}
    </span>
  );
}
