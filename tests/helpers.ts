import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { memberships, user, type Role } from "@/lib/db/schema";
import { renderCvPdf } from "@/lib/demo/cv";
import { createJob } from "@/lib/services/jobs";
import { createOrganization } from "@/lib/services/organizations";
import { submitPublicApplication } from "@/lib/services/public-application";
import type { Ctx } from "@/lib/services/types";
import type { ApplicationData, PublicQuestion } from "@/lib/validation/application";

export async function createUser(name: string) {
  const id = `u_${randomUUID()}`;
  await db.insert(user).values({ id, name, email: `${id}@example.test` });
  return id;
}

/** An organisation with an admin, ready to use. */
export async function createTenant(name: string): Promise<Ctx & { name: string }> {
  const userId = await createUser(`${name} Admin`);
  const org = await createOrganization(userId, {
    name: `${name} ${randomUUID().slice(0, 6)}`,
    locale: "fr",
  });
  return { orgId: org.id, userId, role: "admin", name: org.name };
}

export async function addMember(ctx: Ctx, role: Role, name = "Teammate"): Promise<Ctx> {
  const userId = await createUser(name);
  await db.insert(memberships).values({ organizationId: ctx.orgId, userId, role });
  return { orgId: ctx.orgId, userId, role };
}

export async function publishedJob(ctx: Ctx, title = "Développeur full-stack") {
  return createJob(
    ctx,
    { title, descriptionHtml: "<p>Description</p>", location: "Lyon", department: "Produit" },
    { publish: true },
  );
}

let cvCache: Buffer | null = null;
export async function sampleCv(text = "Kubernetes PostgreSQL TypeScript") {
  if (!cvCache || text !== "Kubernetes PostgreSQL TypeScript") {
    const pdf = await renderCvPdf({
      name: "Marion Lefort",
      headline: "Développeuse",
      email: "marion@example.com",
      phone: "0600000000",
      city: "Lyon",
      summary: text,
      experience: [],
      education: [],
      skills: [],
      languages: [],
      labels: {
        experience: "Expérience",
        education: "Formation",
        skills: "Compétences",
        languages: "Langues",
      },
    });
    if (text !== "Kubernetes PostgreSQL TypeScript") return pdf;
    cvCache = pdf;
  }
  return cvCache;
}

export async function apply(
  ctx: Ctx,
  jobId: string,
  person: Partial<ApplicationData> & { firstName: string; lastName: string; email: string },
  cvText?: string,
  options: { source?: string; questions?: PublicQuestion[] } = {},
) {
  const data = await sampleCv(cvText);
  return submitPublicApplication({
    organizationId: ctx.orgId,
    jobId,
    questions: options.questions ?? [],
    data: {
      phone: "",
      link: "",
      message: "",
      answers: {},
      consent: true,
      ...person,
    } as ApplicationData,
    cv: { name: "cv.pdf", type: "application/pdf", size: data.length, data },
    consentText: "consent",
    source: options.source,
  });
}
