-- Drizzle snapshot of public schema (see shared/schema.ts). Prefer syncing the live DB with:
--   unset NODE_ENV && npm ci && set -a && . ./.env && set +a && npm run db:push
-- Do not run this file blindly on a non-empty database (e.g. CREATE SCHEMA public may fail).

CREATE SCHEMA IF NOT EXISTS "public";
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY,
	"task_id" integer,
	"comment_id" integer,
	"name" text NOT NULL,
	"type" text DEFAULT 'file' NOT NULL,
	"url" text,
	"size" text
);
CREATE TABLE "channel_members" (
	"channel_id" integer,
	"user_id" integer,
	CONSTRAINT "channel_members_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
CREATE TABLE "company_settings" (
	"id" serial PRIMARY KEY,
	"company_name" text DEFAULT '' NOT NULL,
	"workspace_slug" text,
	"logo_url" text,
	"ms365_enabled" boolean DEFAULT false NOT NULL,
	"ms365_tenant_id" text,
	"ms365_client_id" text,
	"ms365_client_secret" text,
	"ms365_allowed_domains" text,
	"task_mark_complete_status" text DEFAULT 'done' NOT NULL,
	"task_client_reopen_status" text DEFAULT 'in-progress' NOT NULL
);
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"type" text DEFAULT 'public' NOT NULL,
	"project_id" integer,
	"created_by_user_id" integer
);
CREATE TABLE "channel_user_read_state" (
	"channel_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_user_read_state_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
CREATE TABLE "checklist_items" (
	"id" serial PRIMARY KEY,
	"task_id" integer NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false
);
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY,
	"task_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"parent_id" integer,
	"type" text DEFAULT 'comment',
	"created_at" timestamp DEFAULT now()
);
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY,
	"channel_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
CREATE TABLE "project_members" (
	"project_id" integer,
	"user_id" integer,
	"client_show_timecards" boolean DEFAULT false,
	"client_task_access" text DEFAULT 'feedback',
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"color" text DEFAULT 'bg-blue-500' NOT NULL,
	"description" text,
	"columns" jsonb DEFAULT '[]' NOT NULL
);
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY,
	"sess" json NOT NULL,
	"expire" timestamp NOT NULL
);
CREATE TABLE "task_assignees" (
	"task_id" integer,
	"user_id" integer,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY,
	"project_id" integer NOT NULL,
	"owner_id" integer,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"status" text DEFAULT 'todo' NOT NULL,
	"board_order" integer DEFAULT 0 NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"tags" text[] DEFAULT '{}',
	"start_date" text,
	"due_date" text,
	"recurrence" jsonb,
	"cover_image" text,
	"created_at" timestamp DEFAULT now()
);
-- If the DB predates owner_id, run once:
--   ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_id integer REFERENCES users(id);
-- If the DB predates board_order, run once:
--   ALTER TABLE tasks ADD COLUMN IF NOT EXISTS board_order integer NOT NULL DEFAULT 0;
CREATE TABLE "time_entries" (
	"id" serial PRIMARY KEY,
	"task_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"description" text,
	"log_date" text NOT NULL,
	"client_visible" boolean DEFAULT true
);
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"username" text NOT NULL CONSTRAINT "users_username_unique" UNIQUE,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"avatar" text,
	"status" text DEFAULT 'online',
	"email" text
);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "channels" ADD CONSTRAINT "channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "channels" ADD CONSTRAINT "channels_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");
ALTER TABLE "channel_user_read_state" ADD CONSTRAINT "channel_user_read_state_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;
ALTER TABLE "channel_user_read_state" ADD CONSTRAINT "channel_user_read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id");
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id");
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id");
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "attachments_pkey" ON "attachments" ("id");
CREATE UNIQUE INDEX "channel_members_channel_id_user_id_pk" ON "channel_members" ("channel_id","user_id");
CREATE UNIQUE INDEX "channels_pkey" ON "channels" ("id");
CREATE UNIQUE INDEX "channel_user_read_state_channel_id_user_id_pk" ON "channel_user_read_state" ("channel_id","user_id");
CREATE UNIQUE INDEX "checklist_items_pkey" ON "checklist_items" ("id");
CREATE UNIQUE INDEX "comments_pkey" ON "comments" ("id");
CREATE UNIQUE INDEX "messages_pkey" ON "messages" ("id");
CREATE UNIQUE INDEX "project_members_project_id_user_id_pk" ON "project_members" ("project_id","user_id");
CREATE UNIQUE INDEX "projects_pkey" ON "projects" ("id");
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
CREATE UNIQUE INDEX "session_pkey" ON "session" ("sid");
CREATE UNIQUE INDEX "task_assignees_task_id_user_id_pk" ON "task_assignees" ("task_id","user_id");
CREATE UNIQUE INDEX "tasks_pkey" ON "tasks" ("id");
CREATE UNIQUE INDEX "time_entries_pkey" ON "time_entries" ("id");
CREATE UNIQUE INDEX "users_pkey" ON "users" ("id");
CREATE UNIQUE INDEX "users_username_unique" ON "users" ("username");
-- If company_settings predates task routing columns, run once:
--   ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS task_mark_complete_status text DEFAULT 'done' NOT NULL;
--   ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS task_client_reopen_status text DEFAULT 'in-progress' NOT NULL;
-- If channels predates created_by_user_id or channel_user_read_state is missing, run db:push or:
--   ALTER TABLE channels ADD COLUMN IF NOT EXISTS created_by_user_id integer REFERENCES users(id);
--   CREATE TABLE IF NOT EXISTS channel_user_read_state ( ... );