begin;

-- Foreign-key / ownership lookup used by ride policies.
create index if not exists community_rides_organizer_id_idx
  on public.community_rides(organizer_id);

-- Canonical, optimized RLS policies. The SELECT wrapper lets Postgres cache auth.uid()
-- once per statement instead of recalculating it for each row.
drop policy if exists "Authenticated users can read community rides" on public.community_rides;
drop policy if exists "Authenticated users can view community rides" on public.community_rides;
create policy "Authenticated users can read community rides"
on public.community_rides for select to authenticated
using (true);

drop policy if exists "Organizers can create community rides" on public.community_rides;
drop policy if exists "Users can create their own community rides" on public.community_rides;
create policy "Organizers can create community rides"
on public.community_rides for insert to authenticated
with check ((select auth.uid()) = organizer_id);

drop policy if exists "Organizers can update community rides" on public.community_rides;
drop policy if exists "Organizers can update their community rides" on public.community_rides;
create policy "Organizers can update community rides"
on public.community_rides for update to authenticated
using ((select auth.uid()) = organizer_id)
with check ((select auth.uid()) = organizer_id);

drop policy if exists "Organizers can delete community rides" on public.community_rides;
drop policy if exists "Organizers can delete their community rides" on public.community_rides;
create policy "Organizers can delete community rides"
on public.community_rides for delete to authenticated
using ((select auth.uid()) = organizer_id);

drop policy if exists "Authenticated users can read participants" on public.ride_participants;
drop policy if exists "Authenticated users can view participants" on public.ride_participants;
create policy "Authenticated users can read participants"
on public.ride_participants for select to authenticated
using (true);

drop policy if exists "Users can join rides" on public.ride_participants;
create policy "Users can join rides"
on public.ride_participants for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.community_rides r
    where r.id = ride_id
      and r.organizer_id <> (select auth.uid())
      and (
        select count(*)
        from public.ride_participants p
        where p.ride_id = r.id
      ) < r.max_participants
  )
);

drop policy if exists "Users can leave rides" on public.ride_participants;
create policy "Users can leave rides"
on public.ride_participants for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their direct messages" on public.direct_messages;
create policy "Users can read their direct messages"
on public.direct_messages for select to authenticated
using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);

drop policy if exists "Users can send direct messages" on public.direct_messages;
create policy "Users can send direct messages"
on public.direct_messages for insert to authenticated
with check ((select auth.uid()) = sender_id and (select auth.uid()) <> recipient_id);

-- Event-trigger helper must never be directly callable from the client API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

commit;
