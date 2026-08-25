create or replace function public.add_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text,
  p_branch_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_user_id is null then
    raise exception 'Target user is required';
  end if;
  if p_role not in ('admin','manager','staff') then
    raise exception 'Invalid member role';
  end if;
  if p_status not in ('invited','active') then
    raise exception 'Invalid invitation status';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_branch_ids, array[]::uuid[])) branch_id
    where not exists (
      select 1
      from public.branches b
      where b.company_id = p_company_id
        and b.id = branch_id
        and b.active
    )
  ) then
    raise exception 'Invalid branch scope';
  end if;

  insert into public.company_members(company_id, user_id, role, status, created_by)
  values (p_company_id, p_user_id, p_role, p_status, auth.uid())
  on conflict (company_id, user_id)
  do update
     set role = excluded.role,
         status = excluded.status
  returning id into v_member_id;

  delete from public.member_scopes ms
   where ms.company_id = p_company_id
     and ms.member_id = v_member_id;

  if p_role in ('manager','staff') then
    insert into public.member_scopes(company_id, member_id, branch_id)
    select p_company_id, v_member_id, branch_id
    from (
      select distinct unnest(coalesce(p_branch_ids, array[]::uuid[])) as branch_id
    ) selected
    where selected.branch_id is not null;
  end if;

  return v_member_id;
end;
$function$;

revoke all on function public.add_company_member(uuid, uuid, text, text, uuid[]) from PUBLIC, anon;
grant execute on function public.add_company_member(uuid, uuid, text, text, uuid[]) to authenticated;
