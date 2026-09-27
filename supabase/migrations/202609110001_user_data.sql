-- Apply once to your Supabase project. No existing application data is deleted.
begin;

create table public.user_data_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
create table public.ride_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  choices text[] not null
);
create table public.wheels (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null check (slot in ('main', 'second')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key (user_id, slot)
);
create table public.rides (
  user_id uuid not null references auth.users(id) on delete cascade,
  ride_id text not null check (length(ride_id) > 0),
  position integer not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key (user_id, ride_id)
);

alter table public.user_data_versions enable row level security;
alter table public.profiles enable row level security;
alter table public.ride_preferences enable row level security;
alter table public.wheels enable row level security;
alter table public.rides enable row level security;
create policy own_version on public.user_data_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy own_preferences on public.ride_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy own_wheels on public.wheels for select to authenticated using ((select auth.uid()) = user_id);
create policy own_rides on public.rides for select to authenticated using ((select auth.uid()) = user_id);

-- Writes go through one atomic, revision-checked RPC. No direct client writes.
revoke all on public.user_data_versions, public.profiles, public.ride_preferences, public.wheels, public.rides from anon, authenticated;
grant select on public.user_data_versions, public.profiles, public.ride_preferences, public.wheels, public.rides to authenticated;

create function public.has_text_fields(value jsonb, fields text[])
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object' and not exists (
    select 1 from unnest(fields) as field where jsonb_typeof(value->field) is distinct from 'string'
  );
$$;

create function public.validate_user_data(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  p jsonb; w jsonb; r jsonb; choice jsonb;
  allowed_types text[] := array['Voie verte', 'Forêt', 'Chemins / VTT', 'Route', 'Urbain', 'Tourisme', 'Longue distance'];
  wheel_fields text[] := array['name', 'battery', 'range', 'terrain'];
  ride_fields text[] := array['id', 'title', 'date', 'time', 'departure', 'type', 'distance', 'level', 'maxParticipants', 'description'];
begin
  if jsonb_typeof(value) is distinct from 'object' or not (value ?& array['profile','preferences','wheels','rides']) then return false; end if;
  p := value->'profile';
  if p <> 'null'::jsonb then
    if not public.has_text_fields(p, array['name','username','location','age','practiceYears','level','bio']) then return false; end if;
    if exists (select 1 from unnest(array['name','username','location','level']) f where btrim(p->>f) = '') then return false; end if;
    if btrim(p->>'age') !~ '^[0-9]+$' or btrim(p->>'practiceYears') !~ '^[0-9]+$' then return false; end if;
    if (p->>'age')::numeric not between 1 and 120 or (p->>'practiceYears')::numeric > (p->>'age')::numeric then return false; end if;
  end if;
  p := value->'preferences';
  if p <> 'null'::jsonb then
    if jsonb_typeof(p) is distinct from 'array' then return false; end if;
    for choice in select jsonb_array_elements(p) loop
      if jsonb_typeof(choice) is distinct from 'string' or not ((choice #>> '{}') = any(allowed_types)) then return false; end if;
    end loop;
    if (select count(*) <> count(distinct item) from jsonb_array_elements(p) item) then return false; end if;
  end if;
  p := value->'wheels';
  if p <> 'null'::jsonb then
    if jsonb_typeof(p) is distinct from 'object' or not (p ?& array['main','second']) then return false; end if;
    for w in select p->'main' union all select p->'second' loop
      if not public.has_text_fields(w, wheel_fields) then return false; end if;
      if exists(select 1 from unnest(wheel_fields) f where btrim(w->>f) = '')
        and exists(select 1 from unnest(wheel_fields) f where w->>f <> '') then return false; end if;
    end loop;
  end if;
  p := value->'rides';
  if jsonb_typeof(p) is distinct from 'array' then return false; end if;
  for r in select jsonb_array_elements(p) loop
    if not public.has_text_fields(r, ride_fields) then return false; end if;
    if exists(select 1 from unnest(ride_fields) f where btrim(r->>f) = '') then return false; end if;
    if not ((r->>'type') = any(allowed_types)) then return false; end if;
    if r->>'date' !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' or r->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if to_char(to_date(r->>'date','DD/MM/YYYY'),'DD/MM/YYYY') <> r->>'date' or right(r->>'date',4)::integer < 2000 then return false; end if;
    if r->>'distance' !~ '^[0-9]+([.,][0-9]+)?$' or r->>'maxParticipants' !~ '^[0-9]+$' then return false; end if;
    if replace(r->>'distance', ',', '.')::numeric <= 0 or (r->>'maxParticipants')::numeric not between 1 and 9007199254740991 then return false; end if;
  end loop;
  if (select count(*) <> count(distinct item->>'id') from jsonb_array_elements(p) item) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

create function public.read_user_data(p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'user_id', p_user_id,
    'revision', coalesce((select revision from public.user_data_versions where user_id = p_user_id), 0),
    'data', jsonb_build_object(
      'profile', (select data from public.profiles where user_id = p_user_id),
      'preferences', (select to_jsonb(choices) from public.ride_preferences where user_id = p_user_id),
      'wheels', (select jsonb_object_agg(slot, data) from public.wheels where user_id = p_user_id),
      'rides', coalesce((select jsonb_agg(data order by position) from public.rides where user_id = p_user_id), '[]'::jsonb)
    )
  );
end;
$$;

create function public.write_user_data(p_user_id uuid, p_expected_revision bigint, p_data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Not authorized' using errcode = '42501'; end if;
  if public.validate_user_data(p_data) is not true then raise exception 'Invalid user data' using errcode = '22023'; end if;
  insert into public.user_data_versions(user_id) values(p_user_id) on conflict do nothing;
  select revision into current_revision from public.user_data_versions where user_id = p_user_id for update;
  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception 'Remote data changed' using errcode = '40001';
  end if;
  -- This replacement is private to the authenticated owner and entirely transactional.
  delete from public.profiles where user_id = p_user_id;
  if p_data->'profile' <> 'null'::jsonb then insert into public.profiles values(p_user_id, p_data->'profile'); end if;
  delete from public.ride_preferences where user_id = p_user_id;
  if p_data->'preferences' <> 'null'::jsonb then
    insert into public.ride_preferences values(p_user_id, array(select jsonb_array_elements_text(p_data->'preferences')));
  end if;
  delete from public.wheels where user_id = p_user_id;
  if p_data->'wheels' <> 'null'::jsonb then
    insert into public.wheels values(p_user_id, 'main', p_data->'wheels'->'main'), (p_user_id, 'second', p_data->'wheels'->'second');
  end if;
  delete from public.rides where user_id = p_user_id;
  insert into public.rides select p_user_id, item->>'id', ordinal::integer, item
    from jsonb_array_elements(p_data->'rides') with ordinality as entry(item, ordinal);
  update public.user_data_versions set revision = current_revision + 1, updated_at = now() where user_id = p_user_id;
  return current_revision + 1;
end;
$$;
revoke all on function public.has_text_fields(jsonb, text[]) from public;
revoke all on function public.validate_user_data(jsonb) from public;
revoke all on function public.read_user_data(uuid) from public;
revoke all on function public.write_user_data(uuid, bigint, jsonb) from public;
grant execute on function public.read_user_data(uuid) to authenticated;
grant execute on function public.write_user_data(uuid, bigint, jsonb) to authenticated;
commit;
