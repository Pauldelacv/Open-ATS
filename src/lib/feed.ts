import type { ContractType, RemotePolicy } from "@/lib/db/schema";

/** Job types understood by most aggregators reading the Indeed-style XML format. */
const jobType: Record<ContractType, string> = {
  cdi: "fulltime",
  cdd: "temporary",
  freelance: "contract",
  apprenticeship: "apprenticeship",
  internship: "internship",
};

const remoteType: Partial<Record<RemotePolicy, string>> = {
  remote: "Fully remote",
  hybrid: "Hybrid remote",
};

export type FeedJob = {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  city: string | null;
  department: string | null;
  contract: ContractType;
  remote: RemotePolicy;
  descriptionHtml: string;
  salary: string | null;
};

/** Text inside CDATA; a literal `]]>` is split across two sections. */
export function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

const escapeText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildJobFeed(input: {
  publisher: string;
  publisherUrl: string;
  company: string;
  jobs: FeedJob[];
  now?: Date;
}): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<source>",
    `  <publisher>${escapeText(input.publisher)}</publisher>`,
    `  <publisherurl>${escapeText(input.publisherUrl)}</publisherurl>`,
    `  <lastBuildDate>${(input.now ?? new Date()).toUTCString()}</lastBuildDate>`,
  ];
  for (const job of input.jobs) {
    const fields: Array<[string, string | null]> = [
      ["title", job.title],
      ["date", job.publishedAt.toUTCString()],
      ["referencenumber", job.id],
      ["url", job.url],
      ["company", input.company],
      ["city", job.city],
      ["description", job.descriptionHtml || job.title],
      ["salary", job.salary],
      ["jobtype", jobType[job.contract]],
      ["remotetype", remoteType[job.remote] ?? null],
      ["category", job.department],
    ];
    lines.push("  <job>");
    for (const [name, value] of fields)
      if (value) lines.push(`    <${name}>${cdata(value)}</${name}>`);
    lines.push("  </job>");
  }
  lines.push("</source>", "");
  return lines.join("\n");
}
