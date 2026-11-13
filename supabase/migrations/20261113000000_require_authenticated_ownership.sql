begin;

-- Replace legacy permissive policies, including those from older installations.
do $$
declare policy record;
begin
  for policy in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('saves', 'tags', 'folders', 'save_tags', 'user_preferences', 'integrations')
  loop
    execute format('drop policy %I on %I.%I', policy.policyname, policy.schemaname, policy.tablename);
  end loop;
end $$;

alter table public.saves enable row level security;
alter table public.tags enable row level security;
alter table public.folders enable row level security;
alter table public.save_tags enable row level security;
alter table public.user_preferences enable row level security;
alter table public.integrations enable row level security;

revoke all on public.saves, public.tags, public.folders, public.save_tags,
  public.user_preferences, public.integrations from public, anon;
revoke all on public.integrations from public, authenticated;
grant select, insert, update, delete on public.saves, public.tags, public.folders,
  public.save_tags, public.user_preferences to authenticated;
grant select, insert, update, delete on public.integrations to service_role;

create policy "Own folders" on public.folders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own saves" on public.saves for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and
    (folder_id is null or exists (
      select 1 from public.folders where id = folder_id and user_id = (select auth.uid())
    ))
  );

create policy "Own tags" on public.tags for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own preferences" on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own save tags" on public.save_tags for all to authenticated
  using (
    exists (select 1 from public.saves where id = save_id and user_id = (select auth.uid())) and
    exists (select 1 from public.tags where id = tag_id and user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.saves where id = save_id and user_id = (select auth.uid())) and
    exists (select 1 from public.tags where id = tag_id and user_id = (select auth.uid()))
  );

commit;
