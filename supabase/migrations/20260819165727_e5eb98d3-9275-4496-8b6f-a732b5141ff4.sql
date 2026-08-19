drop policy if exists "Joey can view complaints" on public.driver_complaints;
drop policy if exists "Joey can view complaint comments" on public.driver_complaint_comments;

create policy "Joey can view complaints"
on public.driver_complaints
for select
to authenticated
using (auth.uid() = 'fd143ad4-fece-45f4-bf93-f3e7b79ce61b'::uuid);

create policy "Joey can view complaint comments"
on public.driver_complaint_comments
for select
to authenticated
using (auth.uid() = 'fd143ad4-fece-45f4-bf93-f3e7b79ce61b'::uuid);