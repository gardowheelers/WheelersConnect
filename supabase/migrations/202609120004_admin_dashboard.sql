-- Additive migration. No automatic administrator assignment and no client-side secrets.
begin;

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;

create function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.app_admins where user_id = auth.uid()
  );
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- No email addresses, private message bodies, IP addresses or locations in the journal.
create table public.admin_events (
  id bigint generated always as identity primary key,
  kind text not null,
  created_at timestamptz not null default now()
);
create index admin_events_created_idx on public.admin_events(created_at desc, id desc);
alter table public.admin_events enable row level security;
revoke all on public.admin_events from public, anon, authenticated;

create function public.log_app_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_kind text;
begin
  if tg_table_schema = 'auth' and tg_table_name = 'users' then
    if tg_op = 'INSERT' then event_kind := 'account_created';
    elsif tg_op = 'DELETE' then event_kind := 'account_deleted';
    elsif new.last_sign_in_at is distinct from old.last_sign_in_at then event_kind := 'account_signed_in';
    end if;
  elsif tg_table_name = 'community_rides' then
    event_kind := case tg_op when 'INSERT' then 'ride_published' when 'UPDATE' then 'ride_updated' else 'ride_removed' end;
  elsif tg_table_name = 'ride_participants' then
    event_kind := case tg_op when 'INSERT' then 'ride_joined' else 'ride_left' end;
  elsif tg_table_name = 'user_data_versions' and tg_op = 'UPDATE' then
    event_kind := 'data_synced';
  end if;
  if event_kind is not null then insert into public.admin_events(kind) values(event_kind); end if;
  return null;
end;
$$;
revoke all on function public.log_app_activity() from public, anon, authenticated;
create trigger wc_account_activity after insert or update of last_sign_in_at or delete on auth.users
for each row execute function public.log_app_activity();
create trigger wc_ride_activity after insert or update or delete on public.community_rides
for each row execute function public.log_app_activity();
create trigger wc_participant_activity after insert or delete on public.ride_participants
for each row execute function public.log_app_activity();
create trigger wc_sync_activity after update on public.user_data_versions
for each row execute function public.log_app_activity();

create function public.admin_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'profiles', (select count(*) from public.profiles),
    'rides', (select count(*) from public.community_rides),
    'participants', (select count(*) from public.ride_participants),
    'signedInLast7Days', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
    'generatedAt', now(),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id::text, 'kind', e.kind, 'created_at', e.created_at) order by e.id desc)
      from (select id, kind, created_at from public.admin_events order by id desc limit 100) e), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
commit;
