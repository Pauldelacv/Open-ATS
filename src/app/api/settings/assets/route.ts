import { eq } from "drizzle-orm";
import { getApiContext } from "@/lib/context";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media";
import { can } from "@/lib/permissions";
import { storage } from "@/lib/storage";
import { shortId } from "@/lib/utils/text";
import { ASSET_LIMITS, IMAGE_TYPES } from "@/lib/validation/organization";

type Kind = keyof typeof ASSET_LIMITS;

function kindOf(request: Request): Kind | null {
  const kind = new URL(request.url).searchParams.get("kind");
  return kind === "logo" || kind === "cover" ? kind : null;
}

export async function POST(request: Request) {
  const ctx = await getApiContext();
  if (!ctx) return Response.json({ ok: false, error: "common.forbidden" }, { status: 401 });
  if (!can(ctx.role, "settings:organization"))
    return Response.json({ ok: false, error: "common.forbidden" }, { status: 403 });
  const kind = kindOf(request);
  if (!kind)
    return Response.json(
      { ok: false, error: "settings.organization.errors.image" },
      { status: 400 },
    );
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return Response.json(
      { ok: false, error: "settings.organization.errors.image" },
      { status: 400 },
    );
  const type = IMAGE_TYPES[file.type];
  const data = Buffer.from(await file.arrayBuffer());
  if (!type || file.size > ASSET_LIMITS[kind] || !type.magic(new Uint8Array(data))) {
    return Response.json(
      { ok: false, error: "settings.organization.errors.image" },
      { status: 422 },
    );
  }
  const key = `org/${ctx.orgId}/public/${kind}-${shortId(10)}.${type.ext}`;
  await storage().put(key, data, file.type);
  const column = kind === "logo" ? "logoKey" : "coverKey";
  const [previous] = await db
    .select({ key: organizations[column] })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId));
  await db
    .update(organizations)
    .set({ [column]: key })
    .where(eq(organizations.id, ctx.orgId));
  if (previous?.key)
    await storage()
      .delete(previous.key)
      .catch(() => {});
  return Response.json({ ok: true, url: mediaUrl(key) });
}

export async function DELETE(request: Request) {
  const ctx = await getApiContext();
  if (!ctx || !can(ctx.role, "settings:organization"))
    return Response.json({ ok: false, error: "common.forbidden" }, { status: 403 });
  const kind = kindOf(request);
  if (!kind) return Response.json({ ok: false }, { status: 400 });
  const column = kind === "logo" ? "logoKey" : "coverKey";
  const [previous] = await db
    .select({ key: organizations[column] })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId));
  await db
    .update(organizations)
    .set({ [column]: null })
    .where(eq(organizations.id, ctx.orgId));
  if (previous?.key)
    await storage()
      .delete(previous.key)
      .catch(() => {});
  return Response.json({ ok: true });
}
