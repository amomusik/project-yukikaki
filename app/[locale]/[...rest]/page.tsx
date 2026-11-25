import { notFound } from "next/navigation";

// Any unknown path under a locale renders app/[locale]/not-found.tsx inside the localized layout.
export default function CatchAll() {
  notFound();
}
