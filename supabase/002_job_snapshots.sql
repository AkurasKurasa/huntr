-- Adds job-post snapshots (description text + the post's image).
-- Run this once in SQL Editor if you already ran schema.sql before this file existed.
-- (schema.sql now includes the same changes, so new projects only need schema.sql.)

alter table public.applications add column if not exists description      text;
alter table public.applications add column if not exists image_path       text;   -- path inside the "job-snapshots" bucket
alter table public.applications add column if not exists image_source_url text;   -- where the image came from
alter table public.applications add column if not exists snapshot_at      timestamptz;

-- Private bucket: <user id>/<application id>.<ext>
insert into storage.buckets (id, name, public)
values ('job-snapshots', 'job-snapshots', false)
on conflict (id) do nothing;

drop policy if exists "own snapshots read" on storage.objects;
create policy "own snapshots read" on storage.objects for select
  using (bucket_id = 'job-snapshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own snapshots delete" on storage.objects;
create policy "own snapshots delete" on storage.objects for delete
  using (bucket_id = 'job-snapshots' and (storage.foldername(name))[1] = auth.uid()::text);
