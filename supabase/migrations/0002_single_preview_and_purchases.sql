-- memni 0002: one shared scene preview (no per-person previews), a free-offer
-- flag on usage, and purchases (test orders until payments are connected).

alter table public.previews add column if not exists paid boolean not null default false;
alter table public.usage_events add column if not exists free boolean not null default false;

-- per-role preview selection/confirmation is no longer used
alter table public.draft_assignments drop column if exists selected_preview_id;
alter table public.draft_assignments drop column if exists confirmed_preview_id;
alter table public.drafts drop column if exists scene_confirmed_preview_id;

-- purchases replace the video-only test orders
drop table if exists public.orders;
create table if not exists public.purchases (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('preview', 'video')),
  ref_id uuid not null,                 -- preview id or video job id
  idempotency_key text not null,
  amount_minor int,
  currency text not null,
  price_is_example boolean not null,
  status text not null check (status in ('test_paid', 'refunded')),
  method text not null default 'test',
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  unique (user_id, idempotency_key)
);
create index if not exists purchases_ref_idx on public.purchases (ref_id);
alter table public.purchases enable row level security;
drop policy if exists purchases_owner_read on public.purchases;
create policy purchases_owner_read on public.purchases for select using (user_id = auth.uid());

-- Insert a pending scene preview atomically with either the free-offer check
-- or a (test) purchase. The same purchase key never creates a second preview.
drop function if exists public.reserve_preview(jsonb, jsonb, int);
create or replace function public.reserve_preview_v2(p jsonb, u jsonb, free_limit int, o jsonb)
returns table (preview public.previews, reused boolean)
language plpgsql security definer set search_path = public as $$
declare
  used int;
  next_seq int;
  existing public.purchases;
  prev public.previews;
  row public.previews;
begin
  perform pg_advisory_xact_lock(hashtext('preview:' || (p->>'user_id')));
  if o is not null then
    select * into existing from purchases where user_id = (o->>'user_id')::uuid and idempotency_key = o->>'idempotency_key';
    if found then
      select * into prev from previews where id = existing.ref_id;
      if found then return query select prev, true; return; end if;
    end if;
  elsif free_limit is not null then
    select count(*) into used from usage_events
      where user_id = (p->>'user_id')::uuid and kind = 'preview_image' and free and not refunded;
    if used >= free_limit then raise exception 'preview_limit' using errcode = 'P0001'; end if;
  end if;
  select count(*) + 1 into next_seq from previews
    where draft_id = (p->>'draft_id')::uuid and kind = p->>'kind' and coalesce(role_id, '') = coalesce(p->>'role_id', '');
  insert into previews (id, user_id, draft_id, kind, role_id, person_id, fingerprint, draft_version, status, provider, is_demo, paid, seq, created_at)
  values ((p->>'id')::uuid, (p->>'user_id')::uuid, (p->>'draft_id')::uuid, p->>'kind', p->>'role_id', (p->>'person_id')::uuid,
          p->>'fingerprint', (p->>'draft_version')::int, 'pending', p->>'provider', (p->>'is_demo')::boolean,
          coalesce((p->>'paid')::boolean, false), next_seq, now())
  returning * into row;
  insert into usage_events (id, user_id, kind, provider, is_demo, ref_id, free, estimated_cost, currency)
  values ((u->>'id')::uuid, (u->>'user_id')::uuid, 'preview_image', u->>'provider', (u->>'is_demo')::boolean,
          (u->>'ref_id')::uuid, coalesce((u->>'free')::boolean, false), (u->>'estimated_cost')::numeric, coalesce(u->>'currency', 'USD'));
  if o is not null then
    insert into purchases (id, user_id, kind, ref_id, idempotency_key, amount_minor, currency, price_is_example, status, method)
    values ((o->>'id')::uuid, (o->>'user_id')::uuid, o->>'kind', (o->>'ref_id')::uuid, o->>'idempotency_key',
            (o->>'amount_minor')::int, o->>'currency', (o->>'price_is_example')::boolean, o->>'status', coalesce(o->>'method', 'test'));
  end if;
  return query select row, false;
end $$;
revoke all on function public.reserve_preview_v2(jsonb, jsonb, int, jsonb) from public, anon, authenticated;
