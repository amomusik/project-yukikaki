"use server";

import { redirect } from "next/navigation";
import { chooseRole } from "@/lib/auth";
import { SKILLS, type Skill } from "@/lib/skills";

export async function chooseRoleAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const role = formData.get("role") === "student" ? "student" : "business";
  const skills = formData.getAll("skills").map(String).filter((s): s is Skill => (SKILLS as readonly string[]).includes(s));
  await chooseRole(role, skills);
  redirect(`/${locale}/${role === "business" ? "interview" : "challenges"}`);
}
