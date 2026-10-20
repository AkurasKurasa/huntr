-- Huntr: saved answers to employer screening questions (JobStreet etc.).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
alter table public.profiles add column if not exists answers jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
