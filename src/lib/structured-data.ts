import type { ContractType, RemotePolicy, SalaryPeriod } from "@/lib/db/schema";

const employmentType: Record<ContractType, string> = {
  cdi: "FULL_TIME",
  cdd: "TEMPORARY",
  freelance: "CONTRACTOR",
  apprenticeship: "OTHER",
  internship: "INTERN",
};

const unitText: Record<SalaryPeriod, string> = {
  year: "YEAR",
  month: "MONTH",
  day: "DAY",
  hour: "HOUR",
};

/** schema.org JobPosting for Google for Jobs and other aggregators. */
export function jobPostingLd(input: {
  title: string;
  descriptionHtml: string;
  publishedAt: Date | null;
  updatedAt: Date;
  contract: ContractType;
  remote: RemotePolicy;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  url: string;
  id: string;
  organization: { name: string; websiteUrl: string | null; logoUrl: string | null };
}) {
  const validThrough = new Date(
    (input.publishedAt ?? input.updatedAt).getTime() + 90 * 24 * 3600 * 1000,
  );
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: input.title,
    description: input.descriptionHtml || input.title,
    identifier: { "@type": "PropertyValue", name: input.organization.name, value: input.id },
    datePosted: (input.publishedAt ?? input.updatedAt).toISOString(),
    validThrough: validThrough.toISOString(),
    employmentType: employmentType[input.contract],
    hiringOrganization: {
      "@type": "Organization",
      name: input.organization.name,
      sameAs: input.organization.websiteUrl ?? undefined,
      logo: input.organization.logoUrl ?? undefined,
    },
    directApply: true,
    url: input.url,
  };
  if (input.location) {
    ld.jobLocation = {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: input.location },
    };
  }
  if (input.remote === "remote") ld.jobLocationType = "TELECOMMUTE";
  if (input.salaryMin !== null || input.salaryMax !== null) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: input.salaryCurrency,
      value: {
        "@type": "QuantitativeValue",
        ...(input.salaryMin !== null &&
        input.salaryMax !== null &&
        input.salaryMin !== input.salaryMax
          ? { minValue: input.salaryMin, maxValue: input.salaryMax }
          : { value: input.salaryMin ?? input.salaryMax }),
        unitText: unitText[input.salaryPeriod],
      },
    };
  }
  return ld;
}

export function ldScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
