CREATE TABLE "workspace_counters" (
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "workspace_counters_workspace_id_kind_pk" PRIMARY KEY("workspace_id","kind"),
	CONSTRAINT "workspace_counters_kind_check" CHECK ("workspace_counters"."kind" in ('job', 'application')),
	CONSTRAINT "workspace_counters_last_value_check" CHECK ("workspace_counters"."last_value" >= 1)
);
--> statement-breakpoint
ALTER TABLE "workspace_counters" ADD CONSTRAINT "workspace_counters_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;