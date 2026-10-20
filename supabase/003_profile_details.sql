-- More about you, so drafts don't need [placeholders].
-- Run once in the Supabase SQL Editor (schema.sql already includes it for new projects).
alter table public.profiles add column if not exists headline  text;  -- e.g. "Web developer focused on Webflow and React"
alter table public.profiles add column if not exists summary   text;  -- 1–3 sentences about you
alter table public.profiles add column if not exists highlight text;  -- one project or result you're proud of

notify pgrst, 'reload schema';
