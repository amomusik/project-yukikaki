"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

/** Native share sheet when available, otherwise copy the link. */
export function ShareButton({ url, title, label, copiedLabel }: { url: string; title: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "rounded-full")}
      data-testid="share-event"
      onClick={async () => {
        const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
        if (nav.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
          try {
            await nav.share({ url, title });
            return;
          } catch {
            /* fall through to copy */
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt(label, url);
        }
      }}
    >
      {copied ? <Check aria-hidden className="h-4 w-4" /> : <Share2 aria-hidden className="h-4 w-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
