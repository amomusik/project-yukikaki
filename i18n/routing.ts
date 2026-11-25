import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ja"],
  // English by default: "/" always redirects to "/en"; Japanese lives at "/ja".
  // Detection is off so neither Accept-Language nor a stale NEXT_LOCALE cookie overrides that.
  defaultLocale: "en",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
