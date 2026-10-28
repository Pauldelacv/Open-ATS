import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";

export default async function SettingsIndex() {
  const ctx = await requireContext();
  if (can(ctx.role, "settings:organization")) redirect("/settings/organization");
  if (can(ctx.role, "templates:manage")) redirect("/settings/emails");
  redirect("/settings/profile");
}
