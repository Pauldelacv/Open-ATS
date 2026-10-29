CREATE TABLE "mailbox_state" (
	"id" text PRIMARY KEY NOT NULL,
	"uid_validity" bigint,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"imported" integer DEFAULT 0 NOT NULL,
	"unmatched" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "direction" text DEFAULT 'outbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "from_email" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "from_name" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "full_body" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "email_message_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_message_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_org_message_id_uq" ON "email_messages" USING btree ("organization_id","message_id");