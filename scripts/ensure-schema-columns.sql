-- Run manually on PostgreSQL if `npm run db:push` is not available and the app fails at startup
-- (e.g. "column last_seen_at does not exist" or "column owner_id does not exist").

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamp;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id integer REFERENCES users(id);

-- Optional: align defaults for new expectations (does not overwrite existing rows)
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'offline';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours numeric(10, 2);

ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at timestamp;

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS time_log_min_description_words integer NOT NULL DEFAULT 10;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS time_log_max_hours_per_entry numeric(8,2);
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS browser_title text;

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS timecard_date_display_format text NOT NULL DEFAULT 'DD/MM/YYYY';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS timecard_summary_recipient_emails jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_digest_timezone text;

ALTER TABLE users ADD COLUMN IF NOT EXISTS project_sidebar_order jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS project_quick_menu_ids jsonb;

ALTER TABLE project_members ADD COLUMN IF NOT EXISTS notify_client_new_task boolean NOT NULL DEFAULT false;
