-- memni: initial schema for real mode (Supabase Postgres + Auth + private Storage).
-- All writes go through the Next.js server / worker with the service-role key,
-- which filters by user_id explicitly. RLS is enabled everywhere as a second
-- line of defence: the anon/authenticated roles can only read their own rows
-- and cannot write at all.

create extension if not exists pgcrypto;

-- ── users ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  kind text not null default 'anon' check (kind in ('anon', 'telegram', 'email')),
  telegram_id text unique,
  display_name text,
  created_at timestamptz not null default now()
);

-- ── templates (mirror of src/lib/templates, seeded by `npm run seed:templates`) ──
create table if not exists public.templates (
  id text primary key,
  version int not null,
  kind text not null,
  title text not null,
  config jsonb not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.template_roles (
  template_id text not null references public.templates (id) on delete cascade,
  role_id text not null,
  name text not null,
  region jsonb not null,
  position int not null,
  primary key (template_id, role_id)
);

-- ── people and their source photos ──────────────────────────────────
create table if not exists public.people (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  saved boolean not null default false,
  main_photo_id uuid,
  appearance_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_user_idx on public.people (user_id);

create table if not exists public.person_photos (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  storage_key text not null,
  mime text not null,
  width int not null,
  height int not null,
  bytes int not null,
  created_at timestamptz not null default now()
);
create index if not exists person_photos_person_idx on public.person_photos (person_id);

-- ── drafts, role assignments and per-order looks ────────────────────
create table if not exists public.drafts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id text not null references public.templates (id),
  template_version int not null,
  version int not null default 1,
  scene jsonb not null,
  scene_selected_preview_id uuid,
  scene_confirmed_preview_id uuid,
  last_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drafts_user_idx on public.drafts (user_id, updated_at desc);

create table if not exists public.draft_assignments (
  draft_id uuid not null references public.drafts (id) on delete cascade,
  role_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  look jsonb not null,                -- LookSettings: the person's look in THIS order
  selected_preview_id uuid,
  confirmed_preview_id uuid,
  primary key (draft_id, role_id)
);

-- ── preview versions (history) ──────────────────────────────────────
create table if not exists public.previews (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  kind text not null check (kind in ('person', 'scene')),
  role_id text,
  person_id uuid references public.people (id) on delete cascade,
  fingerprint text not null,
  draft_version int not null,
  status text not null check (status in ('pending', 'ready', 'failed')),
  provider text not null,
  is_demo boolean not null,
  storage_key text,
  error text,
  seq int not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists previews_draft_idx on public.previews (draft_id, created_at);

-- ── video jobs ──────────────────────────────────────────────────────
create table if not exists public.video_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid references public.drafts (id) on delete set null,
  idempotency_key text not null,
  status text not null check (status in ('queued','submitting','generating','assembling','ready','failed','needs_review')),
  input jsonb not null,               -- frozen inputs: prompt, file keys, template version
  provider text not null,
  is_demo boolean not null,
  provider_task_id text,
  provider_external_id text,
  attempts int not null default 0,
  max_attempts int not null,
  error text,
  error_code text,
  result_key text,
  raw_result_key text,
  result_meta jsonb,
  estimated_cost numeric,
  actual_cost numeric,
  cost_currency text,
  locked_by text,
  locked_until timestamptz,
  next_poll_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, idempotency_key)
);
create index if not exists video_jobs_active_idx on public.video_jobs (status, next_poll_at) where status in ('queued','submitting','generating','assembling');
create index if not exists video_jobs_provider_task_idx on public.video_jobs (provider, provider_task_id);

-- ── result files ────────────────────────────────────────────────────
create table if not exists public.result_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.video_jobs (id) on delete cascade,
  kind text not null check (kind in ('raw', 'final')),
  storage_key text not null,
  duration_sec numeric,
  has_audio boolean,
  created_at timestamptz not null default now()
);

-- ── spend and free-preview accounting ───────────────────────────────
create table if not exists public.usage_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('preview_image', 'video')),
  provider text not null,
  is_demo boolean not null,
  ref_id uuid,
  estimated_cost numeric,
  actual_cost numeric,
  currency text not null default 'USD',
  refunded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists usage_user_kind_idx on public.usage_events (user_id, kind) where not refunded;

-- ── test orders (no money is charged in this version) ───────────────
create table if not exists public.orders (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.video_jobs (id) on delete cascade,
  amount_minor int,
  currency text not null,
  price_is_example boolean not null,
  status text not null check (status = 'test'),
  method text not null default 'none',
  created_at timestamptz not null default now()
);

-- ── RLS: owners may read; nobody writes except the service role ─────
do $$
declare t text;
begin
  foreach t in array array['profiles','people','person_photos','drafts','draft_assignments','previews','video_jobs','result_files','usage_events','orders']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_read', t);
    if t = 'profiles' then
      execute format('create policy %I on public.%I for select using (id = auth.uid())', t || '_owner_read', t);
    else
      execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_owner_read', t);
    end if;
  end loop;
end $$;
alter table public.templates enable row level security;
alter table public.template_roles enable row level security;
drop policy if exists templates_read on public.templates;
create policy templates_read on public.templates for select using (true);
drop policy if exists template_roles_read on public.template_roles;
create policy template_roles_read on public.template_roles for select using (true);

-- ── private bucket; no storage policies → only the service role can touch files ──
insert into storage.buckets (id, name, public)
values ('memni-private', 'memni-private', false)
on conflict (id) do update set public = false;

-- ── atomic operations used by the server ────────────────────────────

-- Check the free-preview quota and insert the pending preview + usage event in one transaction.
create or replace function public.reserve_preview(p jsonb, u jsonb, lim int)
returns public.previews
language plpgsql security definer set search_path = public as $$
declare
  used int;
  next_seq int;
  row public.previews;
begin
  perform pg_advisory_xact_lock(hashtext('preview:' || (p->>'user_id')));
  select count(*) into used from usage_events
    where user_id = (p->>'user_id')::uuid and kind = 'preview_image' and not refunded;
  if used >= lim then
    raise exception 'preview_limit' using errcode = 'P0001';
  end if;
  select count(*) + 1 into next_seq from previews
    where draft_id = (p->>'draft_id')::uuid and kind = p->>'kind' and coalesce(role_id, '') = coalesce(p->>'role_id', '');
  insert into previews (id, user_id, draft_id, kind, role_id, person_id, fingerprint, draft_version, status, provider, is_demo, seq, created_at)
  values ((p->>'id')::uuid, (p->>'user_id')::uuid, (p->>'draft_id')::uuid, p->>'kind', p->>'role_id', (p->>'person_id')::uuid,
          p->>'fingerprint', (p->>'draft_version')::int, 'pending', p->>'provider', (p->>'is_demo')::boolean, next_seq, now())
  returning * into row;
  insert into usage_events (id, user_id, kind, provider, is_demo, ref_id, estimated_cost, currency)
  values ((u->>'id')::uuid, (u->>'user_id')::uuid, 'preview_image', u->>'provider', (u->>'is_demo')::boolean,
          (u->>'ref_id')::uuid, (u->>'estimated_cost')::numeric, coalesce(u->>'currency', 'USD'));
  return row;
end $$;

-- Return the existing job for the idempotency key, or insert a new one if limits allow.
create or replace function public.create_video_job(j jsonb, per_user int, global_limit int, per_day int)
returns table (job public.video_jobs, created boolean)
language plpgsql security definer set search_path = public as $$
declare
  existing public.video_jobs;
  mine int; total int; today int;
  inserted public.video_jobs;
begin
  perform pg_advisory_xact_lock(hashtext('jobs'));
  select * into existing from video_jobs where user_id = (j->>'user_id')::uuid and idempotency_key = j->>'idempotency_key';
  if found then
    return query select existing, false; return;
  end if;
  select count(*) into mine from video_jobs where user_id = (j->>'user_id')::uuid and status in ('queued','submitting','generating','assembling');
  if mine >= per_user then raise exception 'active_jobs' using errcode = 'P0001'; end if;
  select count(*) into total from video_jobs where status in ('queued','submitting','generating','assembling');
  if total >= global_limit then raise exception 'global_jobs' using errcode = 'P0001'; end if;
  select count(*) into today from video_jobs where user_id = (j->>'user_id')::uuid and created_at > now() - interval '1 day';
  if today >= per_day then raise exception 'daily_jobs' using errcode = 'P0001'; end if;
  insert into video_jobs (id, user_id, draft_id, idempotency_key, status, input, provider, is_demo, attempts, max_attempts, estimated_cost, cost_currency, created_at, updated_at)
  values ((j->>'id')::uuid, (j->>'user_id')::uuid, (j->>'draft_id')::uuid, j->>'idempotency_key', 'queued', j->'input',
          j->>'provider', (j->>'is_demo')::boolean, 0, (j->>'max_attempts')::int, (j->>'estimated_cost')::numeric, j->>'cost_currency', now(), now())
  returning * into inserted;
  return query select inserted, true;
end $$;

-- Lease the next job that needs the worker's attention (skip rows other workers hold).
create or replace function public.claim_video_job(worker text, lease_ms int)
returns setof public.video_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update video_jobs v set locked_by = worker,
         locked_until = now() + make_interval(secs => lease_ms / 1000.0),
         updated_at = now()
   where v.id = (
     select id from video_jobs
      where status in ('queued','submitting','generating','assembling')
        and (locked_until is null or locked_until < now())
        and (next_poll_at is null or next_poll_at <= now())
      order by created_at
      limit 1
      for update skip locked)
  returning v.*;
end $$;

revoke all on function public.reserve_preview(jsonb, jsonb, int) from public, anon, authenticated;
revoke all on function public.create_video_job(jsonb, int, int, int) from public, anon, authenticated;
revoke all on function public.claim_video_job(text, int) from public, anon, authenticated;
