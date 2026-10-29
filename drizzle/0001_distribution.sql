CREATE TABLE "distribution_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "channel_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "channel_name" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "in_feeds" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "distribution_channels" ADD CONSTRAINT "distribution_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_channels_org_slug_uq" ON "distribution_channels" USING btree ("organization_id","slug");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_channel_id_distribution_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."distribution_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_channel_idx" ON "applications" USING btree ("channel_id");--> statement-breakpoint
-- Default channels for organisations created before distribution existed (same list as
-- src/lib/services/default-channels.ts).
INSERT INTO "distribution_channels" ("organization_id", "name", "slug", "position")
SELECT o.id, c.name, c.slug, c.position
FROM "organizations" o
CROSS JOIN (VALUES
  ('fr', 'LinkedIn', 'linkedin', 0),
  ('fr', 'Indeed', 'indeed', 1),
  ('fr', 'Welcome to the Jungle', 'welcome-to-the-jungle', 2),
  ('fr', 'France Travail', 'france-travail', 3),
  ('fr', 'HelloWork', 'hellowork', 4),
  ('fr', 'Réseaux sociaux', 'reseaux-sociaux', 5),
  ('fr', 'Cooptation', 'cooptation', 6),
  ('en', 'LinkedIn', 'linkedin', 0),
  ('en', 'Indeed', 'indeed', 1),
  ('en', 'Glassdoor', 'glassdoor', 2),
  ('en', 'Social media', 'social-media', 3),
  ('en', 'Referral', 'referral', 4)
) AS c(locale, name, slug, position)
WHERE c.locale = o.locale
ON CONFLICT DO NOTHING;
