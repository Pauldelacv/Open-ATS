import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applications, organizations } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/permissions";
import {
  ChannelNameError,
  channelForSource,
  createChannel,
  deleteChannel,
  getJobDistribution,
  listChannels,
  organizationFeed,
  renameChannel,
  setJobInFeeds,
} from "@/lib/services/distribution";
import { createJob } from "@/lib/services/jobs";
import type { Ctx } from "@/lib/services/types";
import { addMember, apply, createTenant, publishedJob } from "../helpers";

describe("distribution", () => {
  let ctx: Ctx;
  let other: Ctx;
  let job: { id: string; slug: string };
  let orgSlug: string;

  beforeAll(async () => {
    ctx = await createTenant("Diffusion");
    other = await createTenant("Ailleurs");
    job = await publishedJob(ctx, "Ébéniste");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    orgSlug = org!.slug;
  });

  it("creates default channels with every organisation", async () => {
    const channels = await listChannels(ctx);
    expect(channels.map((c) => c.slug)).toEqual([
      "linkedin",
      "indeed",
      "welcome-to-the-jungle",
      "france-travail",
      "hellowork",
      "reseaux-sociaux",
      "cooptation",
    ]);
  });

  it("gives new channels a unique short name and refuses empty ones", async () => {
    const first = await createChannel(ctx, "Jobteaser");
    const second = await createChannel(ctx, "JobTeaser");
    expect(first.slug).toBe("jobteaser");
    expect(second.slug).toBe("jobteaser-2");
    await expect(createChannel(ctx, "  ")).rejects.toBeInstanceOf(ChannelNameError);
    await expect(createChannel(ctx, "!!!")).rejects.toBeInstanceOf(ChannelNameError);
  });

  it("credits the tracked link on the application and keeps the first channel", async () => {
    const result = await apply(
      ctx,
      job.id,
      { firstName: "Léa", lastName: "Martin", email: "lea.martin@example.test" },
      undefined,
      { source: "linkedin" },
    );
    await apply(
      ctx,
      job.id,
      { firstName: "Léa", lastName: "Martin", email: "lea.martin@example.test" },
      undefined,
      { source: "indeed" },
    );
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, result.applicationId));
    expect(app!.channelName).toBe("LinkedIn");
  });

  it("ignores unknown short names and other organisations' channels", async () => {
    expect(await channelForSource(ctx.orgId, "nope")).toBeNull();
    expect(await channelForSource(other.orgId, "jobteaser")).toBeNull();
    const result = await apply(
      ctx,
      job.id,
      { firstName: "Paul", lastName: "Durand", email: "paul.durand@example.test" },
      undefined,
      { source: "nope" },
    );
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, result.applicationId));
    expect(app!.channelId).toBeNull();
  });

  it("counts applications per channel and keeps the name of a deleted channel", async () => {
    const jobteaser = (await listChannels(ctx)).find((c) => c.slug === "jobteaser")!;
    await apply(
      ctx,
      job.id,
      { firstName: "Nora", lastName: "Petit", email: "nora.petit@example.test" },
      undefined,
      { source: "jobteaser" },
    );
    await deleteChannel(ctx, jobteaser.id);
    const view = await getJobDistribution(ctx, job.id);
    expect(view.channels.find((c) => c.slug === "linkedin")!.applications).toBe(1);
    expect(view.direct).toBe(1);
    expect(view.removedChannels).toEqual([{ name: "Jobteaser", applications: 1 }]);
    expect(view.channels.find((c) => c.slug === "linkedin")!.url).toMatch(
      new RegExp(`/careers/${orgSlug}/jobs/${job.slug}\\?src=linkedin$`),
    );
    expect(view.ad).toContain("Ébéniste");
    expect(view.ad).toContain("Contrat : CDI");
  });

  it("renames without changing the short name", async () => {
    const indeed = (await listChannels(ctx)).find((c) => c.slug === "indeed")!;
    const renamed = await renameChannel(ctx, indeed.id, "Indeed France");
    expect(renamed.slug).toBe("indeed");
  });

  it("lists published jobs in the feed, with the channel on links", async () => {
    await createJob(ctx, { title: "Brouillon secret" });
    const hidden = await publishedJob(ctx, "Poste hors flux");
    await setJobInFeeds(ctx, hidden.id, false);
    const xml = (await organizationFeed(orgSlug, "indeed"))!;
    expect(xml).toContain("Ébéniste");
    expect(xml).not.toContain("Brouillon secret");
    expect(xml).not.toContain("Poste hors flux");
    expect(xml).toContain(`/jobs/${job.slug}?src=indeed`);
    const plain = (await organizationFeed(orgSlug, "unknown"))!;
    expect(plain).not.toContain("?src=");
    expect(await organizationFeed("no-such-org", null)).toBeNull();
  });

  it("keeps channels and job settings inside the organisation", async () => {
    const mine = (await listChannels(ctx))[0]!;
    await expect(renameChannel(other, mine.id, "Piratage")).rejects.toBeInstanceOf(NotFoundError);
    await deleteChannel(other, mine.id);
    expect((await listChannels(ctx)).some((c) => c.id === mine.id)).toBe(true);
    await expect(getJobDistribution(other, job.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobInFeeds(other, job.id, false)).rejects.toBeInstanceOf(NotFoundError);
    const member = await addMember(ctx, "member");
    await expect(getJobDistribution(member, job.id)).rejects.toThrow();
  });
});
