import { redirect } from "next/navigation";
import { getSession } from "@/lib/context";
import { homeDestination } from "@/lib/services/organizations";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getSession()) redirect("/jobs");
  const destination = await homeDestination();
  if (destination.kind === "careers") redirect(`/careers/${destination.slug}`);
  redirect(destination.kind === "setup" ? "/setup" : "/login");
}
