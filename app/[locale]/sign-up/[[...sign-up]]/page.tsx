import { SignUp } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("common");
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Say why we're asking: owners arrive here from "Bring a problem", builders from RSVP or "Form a team". */}
      <p className="max-w-md text-balance text-center text-sm leading-relaxed text-muted [word-break:auto-phrase]">{t("signUpIntro")}</p>
      <SignUp />
    </div>
  );
}
