begin;

create table if not exists public.community_rides (
  id text primary key check (length(btrim(id)) > 0),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  ride_date text not null check (ride_date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'),
  ride_time text not null check (ride_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  departure text not null check (length(btrim(departure)) between 1 and 200),
  ride_type text not null,
  distance text not null,
  level text not null check (length(btrim(level)) between 1 and 80),
  max_participants integer not null check (max_participants between 1 and 1000),
  description text not null check (length(btrim(description)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ride_participants (
  ride_id text not null references public.community_rides(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create index if not exists community_rides_created_idx on public.community_rides(created_at desc);
create index if not exists ride_participants_user_idx on public.ride_participants(user_id);

alter table public.community_rides enable row level security;
alter table public.ride_participants enable row level security;

drop policy if exists "Authenticated users can read community rides" on public.community_rides;
create policy "Authenticated users can read community rides"
on public.community_rides for select to authenticated
using (true);

drop policy if exists "Organizers can create community rides" on public.community_rides;
create policy "Organizers can create community rides"
on public.community_rides for insert to authenticated
with check (auth.uid() = organizer_id);

drop policy if exists "Organizers can update community rides" on public.community_rides;
create policy "Organizers can update community rides"
on public.community_rides for update to authenticated
using (auth.uid() = organizer_id)
with check (auth.uid() = organizer_id);

drop policy if exists "Organizers can delete community rides" on public.community_rides;
create policy "Organizers can delete community rides"
on public.community_rides for delete to authenticated
using (auth.uid() = organizer_id);

drop policy if exists "Authenticated users can read participants" on public.ride_participants;
create policy "Authenticated users can read participants"
on public.ride_participants for select to authenticated
using (true);

drop policy if exists "Users can join rides" on public.ride_participants;
create policy "Users can join rides"
on public.ride_participants for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.community_rides r
    where r.id = ride_id
      and r.organizer_id <> auth.uid()
      and (select count(*) from public.ride_participants p where p.ride_id = r.id) < r.max_participants
  )
);

drop policy if exists "Users can leave rides" on public.ride_participants;
create policy "Users can leave rides"
on public.ride_participants for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.community_rides to authenticated;
grant select, insert, delete on public.ride_participants to authenticated;

commit;
