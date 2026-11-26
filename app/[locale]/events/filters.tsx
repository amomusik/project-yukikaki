"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Select } from "@/components/ui";

type Option = { value: string; label: string };

/** City / format / month filters; navigates on change (works as a plain GET form without JS). */
export function EventFilters({ cities, formats, months, current }: { cities: string[]; formats: Option[]; months: Option[]; current: { city?: string; format?: string; month?: string } }) {
  const t = useTranslations("events");
  const router = useRouter();
  const go = (form: HTMLFormElement) => {
    const q: Record<string, string> = {};
    for (const [k, v] of new FormData(form).entries()) if (v) q[k] = String(v);
    router.replace({ pathname: "/events", query: q });
  };
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3"
      onChange={(e) => go(e.currentTarget)}
      onSubmit={(e) => {
        e.preventDefault();
        go(e.currentTarget);
      }}
      data-testid="event-filters"
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("filters.city")}</span>
        <Select name="city" defaultValue={current.city ?? ""} className="min-w-36 rounded-full py-1.5">
          <option value="">{t("filters.allCities")}</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("filters.format")}</span>
        <Select name="format" defaultValue={current.format ?? ""} className="min-w-36 rounded-full py-1.5">
          <option value="">{t("filters.allFormats")}</option>
          {formats.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("filters.month")}</span>
        <Select name="month" defaultValue={current.month ?? ""} className="min-w-36 rounded-full py-1.5">
          <option value="">{t("filters.anyMonth")}</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </label>
      <noscript>
        <button type="submit" className="rounded-full border border-line px-4 py-1.5 text-sm">
          {t("filters.apply")}
        </button>
      </noscript>
    </form>
  );
}
