"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { sendImpactCheckAction, type ImpactResult } from "./actions";

export function ImpactCheckButton({
  deliveryId,
  locale,
  labels,
}: {
  deliveryId: string;
  locale: string;
  labels: { send: string; emailed: string; fallback: string; copy: string; copied: string };
}) {
  const [state, action, pending] = useActionState<ImpactResult | null, FormData>(sendImpactCheckAction, null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="deliveryId" value={deliveryId} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary" disabled={pending}>
          ✉️ {labels.send}
        </Button>
      </form>
      {state && "error" in state && <p className="text-sm text-rose-600">{state.error}</p>}
      {state && "link" in state && state.emailed && (
        <p className="text-sm text-emerald-700">{labels.emailed.replace("{email}", state.to ?? "")}</p>
      )}
      {state && "link" in state && !state.emailed && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p>{labels.fallback}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs dark:bg-slate-900" data-testid="impact-link">
              {state.link}
            </code>
            <Button
              type="button"
              variant="secondary"
              className="py-1"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link);
                setCopied(true);
              }}
            >
              {copied ? labels.copied : labels.copy}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
