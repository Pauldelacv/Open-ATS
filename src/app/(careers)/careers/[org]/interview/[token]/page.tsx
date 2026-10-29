import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BrandBar, CareersContainer, CareersFooter } from "@/components/careers/chrome";
import { SlotPicker } from "@/components/careers/slot-picker";
import { getCareerOrganization } from "@/lib/careers";
import { getPublicProposal, locationLine } from "@/lib/services/interviews";

export async function generateMetadata({
  params,
}: PageProps<"/careers/[org]/interview/[token]">): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await getCareerOrganization(slug);
  const t = await getTranslations({ locale: org?.locale ?? "fr", namespace: "interviews.public" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

export default async function InterviewSlotsPage({
  params,
}: PageProps<"/careers/[org]/interview/[token]">) {
  const { org: slug, token } = await params;
  const [org, proposal] = await Promise.all([
    getCareerOrganization(slug),
    getPublicProposal(slug, token),
  ]);
  if (!org || !proposal) notFound();
  return (
    <>
      <BrandBar org={org} />
      <main className="flex-1 pb-28">
        <CareersContainer className="pt-6 md:pt-12">
          <div className="max-w-[680px]">
            <SlotPicker
              orgSlug={org.slug}
              token={token}
              proposal={{
                status: proposal.status,
                jobTitle: proposal.job.title,
                company: proposal.org.name,
                durationMinutes: proposal.durationMinutes,
                where: locationLine(proposal.locationKind, proposal.location, org.locale),
                videoUrl:
                  proposal.locationKind === "video" && proposal.location ? proposal.location : null,
                timeZone: proposal.timeZone,
                interview: proposal.interview
                  ? {
                      startsAt: proposal.interview.startsAt.toISOString(),
                      endsAt: proposal.interview.endsAt.toISOString(),
                      canChange: proposal.interview.canChange,
                    }
                  : null,
                available: proposal.available,
              }}
            />
          </div>
        </CareersContainer>
      </main>
      <CareersFooter org={org} />
    </>
  );
}
