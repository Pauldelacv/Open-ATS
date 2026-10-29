import { describe, expect, it } from "vitest";
import { trackedSource } from "@/lib/careers";
import { buildJobFeed, cdata } from "@/lib/feed";

describe("XML feed", () => {
  const job = {
    id: "job-1",
    title: "Ébéniste d'atelier (F/H)",
    url: "https://jobs.example/careers/acme/jobs/ebeniste?src=indeed",
    publishedAt: new Date("2026-10-20T08:00:00Z"),
    city: "Vénissieux",
    department: "Atelier",
    contract: "cdi" as const,
    remote: "hybrid" as const,
    descriptionHtml: "<p>Tables & chaises</p>",
    salary: "32 000 € – 38 000 € par an",
  };

  it("wraps text in CDATA and splits a closing sequence", () => {
    expect(cdata("a]]>b")).toBe("<![CDATA[a]]]]><![CDATA[>b]]>");
  });

  it("lists jobs with the fields aggregators read", () => {
    const xml = buildJobFeed({
      publisher: "Acme & Co",
      publisherUrl: "https://jobs.example/careers/acme",
      company: "Acme & Co",
      jobs: [job],
      now: new Date("2026-10-29T10:00:00Z"),
    });
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain("<publisher>Acme &amp; Co</publisher>");
    expect(xml).toContain("<title><![CDATA[Ébéniste d'atelier (F/H)]]></title>");
    expect(xml).toContain(
      "<url><![CDATA[https://jobs.example/careers/acme/jobs/ebeniste?src=indeed]]></url>",
    );
    expect(xml).toContain("<date><![CDATA[Tue, 20 Oct 2026 08:00:00 GMT]]></date>");
    expect(xml).toContain("<jobtype><![CDATA[fulltime]]></jobtype>");
    expect(xml).toContain("<remotetype><![CDATA[Hybrid remote]]></remotetype>");
    expect(xml).toContain("<description><![CDATA[<p>Tables & chaises</p>]]></description>");
    expect(xml.match(/<job>/g)).toHaveLength(1);
  });

  it("leaves out empty fields", () => {
    const xml = buildJobFeed({
      publisher: "Acme",
      publisherUrl: "https://jobs.example",
      company: "Acme",
      jobs: [{ ...job, city: null, salary: null, department: null, remote: "onsite" }],
    });
    expect(xml).not.toContain("<city>");
    expect(xml).not.toContain("<salary>");
    expect(xml).not.toContain("<remotetype>");
  });
});

describe("tracked source", () => {
  it("accepts channel short names only", () => {
    expect(trackedSource("linkedin")).toBe("linkedin");
    expect(trackedSource(["welcome-to-the-jungle", "x"])).toBe("welcome-to-the-jungle");
    expect(trackedSource("LinkedIn")).toBeNull();
    expect(trackedSource("a b")).toBeNull();
    expect(trackedSource("-x")).toBeNull();
    expect(trackedSource(undefined)).toBeNull();
    expect(trackedSource("x".repeat(61))).toBeNull();
  });
});
