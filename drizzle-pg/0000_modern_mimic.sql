CREATE TABLE "assistant_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"action_json" text,
	"action_status" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"health" text DEFAULT 'green' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"last_touched" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"effort" integer DEFAULT 2 NOT NULL,
	"due_date" text,
	"planned_for" text,
	"waiting_on" text,
	"reviewed_at" timestamp with time zone,
	"review_state" text,
	"review_note" text,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assistant_messages_action_status" ON "assistant_messages" USING btree ("action_status");--> statement-breakpoint
CREATE INDEX "idx_tasks_status_planned_for" ON "tasks" USING btree ("status","planned_for");