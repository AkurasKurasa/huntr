-- Huntr database schema for Supabase (Postgres).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles: the details Huntr uses to fill in drafts.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  school        text,
  degree        text,          -- e.g. "4th-year BS Computer Science student"
  skills        text[] not null default '{}',
  portfolio_url text,
  resume_path   text,          -- path inside the "resumes" storage bucket
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Create an empty profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Applications: one row per job link.
--   stage  = furthest point the application reached
--   status = where it stands now
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  source_url       text not null,
  title            text,
  company          text,
  location         text,
  method           text not null check (method in ('email', 'site')),
  apply_email      text,
  apply_url        text,
  instructions     text[] not null default '{}',
  skills           text[] not null default '{}',
  needs            text[] not null default '{}',   -- e.g. {resume, cover letter, portfolio, screening}
  subject          text,
  body             text,
  tone             text not null default 'formal' check (tone in ('formal', 'friendly', 'concise')),
  stage            text not null default 'applied'
                     check (stage in ('applied', 'replied', 'screen', 'interview')),
  status           text not null default 'draft'
                     check (status in ('draft', 'waiting', 'in_progress', 'offer', 'rejected', 'ghosted', 'declined')),
  note             text,
  gmail_message_id text,
  sent_at          timestamptz,
  description      text,          -- snapshot of the job description
  image_path       text,          -- snapshot image, inside the "job-snapshots" bucket
  image_source_url text,
  snapshot_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists applications_user_idx on public.applications (user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Gmail refresh tokens. Only the server (service role) can read these.
-- ---------------------------------------------------------------------------
create table if not exists public.gmail_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text,
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.applications enable row level security;
alter table public.gmail_tokens enable row level security;  -- no policies = service role only

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own applications" on public.applications;
create policy "own applications" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: private "resumes" bucket, one folder per user (<user id>/resume.pdf)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "own resume read" on storage.objects;
create policy "own resume read" on storage.objects for select
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own resume write" on storage.objects;
create policy "own resume write" on storage.objects for insert
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own resume update" on storage.objects;
create policy "own resume update" on storage.objects for update
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own resume delete" on storage.objects;
create policy "own resume delete" on storage.objects for delete
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Storage: private "job-snapshots" bucket (<user id>/<application id>.<ext>)
-- The server uploads these; users can view and delete their own.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('job-snapshots', 'job-snapshots', false)
on conflict (id) do nothing;

drop policy if exists "own snapshots read" on storage.objects;
create policy "own snapshots read" on storage.objects for select
  using (bucket_id = 'job-snapshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own snapshots delete" on storage.objects;
create policy "own snapshots delete" on storage.objects for delete
  using (bucket_id = 'job-snapshots' and (storage.foldername(name))[1] = auth.uid()::text);
