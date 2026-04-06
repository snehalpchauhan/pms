-- Run manually on PostgreSQL if `npm run db:push` is not available and the app fails at startup
-- (e.g. "column last_seen_at does not exist" or "column owner_id does not exist").

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamp;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id integer REFERENCES users(id);

-- Optional: align defaults for new expectations (does not overwrite existing rows)
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'offline';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours numeric(10, 2);

ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at timestamp;

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS time_log_min_description_words integer NOT NULL DEFAULT 10;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS browser_title text;

ALTER TABLE users ADD COLUMN IF NOT EXISTS project_sidebar_order jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS project_quick_menu_ids jsonb;
