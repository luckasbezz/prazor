create unique index if not exists member_scopes_unique_branch_scope_idx
  on public.member_scopes (company_id, member_id, branch_id)
  where branch_id is not null and department_id is null;

create unique index if not exists member_scopes_unique_department_scope_idx
  on public.member_scopes (company_id, member_id, department_id)
  where department_id is not null and branch_id is null;

create index if not exists company_members_user_status_company_idx
  on public.company_members (user_id, status, company_id);

create index if not exists company_members_company_status_role_idx
  on public.company_members (company_id, status, role);

create or replace function prazor_private.guard_company_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_other_owner boolean;
begin
  if v_actor is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if not prazor_private.has_company_role(new.company_id, array['owner','admin']) then
      if not (
        new.user_id = v_actor
        and new.role = 'owner'
        and new.status = 'active'
        and not exists (
          select 1 from public.company_members x where x.company_id = new.company_id
        )
      ) then
        raise exception 'Not authorized to add company member';
      end if;
    end if;

    if new.role in ('owner','admin')
       and exists (select 1 from public.company_members x where x.company_id = new.company_id)
       and not prazor_private.has_company_role(new.company_id, array['owner']) then
      raise exception 'Only an owner can assign owner or admin roles';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id or new.user_id <> old.user_id then
      raise exception 'company_id and user_id are immutable';
    end if;

    if new.user_id = v_actor
       and old.status = 'invited'
       and new.status = 'active'
       and new.role = old.role
       and new.created_by is not distinct from old.created_by then
      return new;
    end if;

    if not prazor_private.has_company_role(old.company_id, array['owner','admin']) then
      raise exception 'Not authorized to update company member';
    end if;

    if old.role in ('owner','admin') or new.role in ('owner','admin') then
      if not prazor_private.has_company_role(old.company_id, array['owner']) then
        raise exception 'Only an owner can modify owner or admin membership';
      end if;
    end if;

    if old.role = 'owner' and old.status = 'active'
       and (new.role <> 'owner' or new.status <> 'active') then
      select exists (
        select 1 from public.company_members x
        where x.company_id = old.company_id
          and x.id <> old.id
          and x.role = 'owner'
          and x.status = 'active'
      ) into v_other_owner;
      if not v_other_owner then
        raise exception 'A company must retain at least one active owner';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not prazor_private.has_company_role(old.company_id, array['owner','admin']) then
      raise exception 'Not authorized to remove company member';
    end if;

    if old.role in ('owner','admin') and not prazor_private.has_company_role(old.company_id, array['owner']) then
      raise exception 'Only an owner can remove an owner or admin';
    end if;

    if old.role = 'owner' and old.status = 'active' then
      select exists (
        select 1 from public.company_members x
        where x.company_id = old.company_id
          and x.id <> old.id
          and x.role = 'owner'
          and x.status = 'active'
      ) into v_other_owner;
      if not v_other_owner then
        raise exception 'A company must retain at least one active owner';
      end if;
    end if;
    return old;
  end if;

  return coalesce(new, old);
end;
$function$;

create or replace function public.list_company_members(p_company_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role text,
  status text,
  branch_ids uuid[],
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1
    from public.company_members actor
    where actor.company_id = p_company_id
      and actor.user_id = v_actor
      and actor.status = 'active'
  ) then
    raise exception 'Company access denied';
  end if;

  return query
  select
    cm.id,
    cm.user_id,
    coalesce(u.email, '')::text,
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Pessoa da equipe'
    )::text,
    cm.role,
    cm.status,
    coalesce(
      array_agg(distinct ms.branch_id) filter (where ms.branch_id is not null),
      array[]::uuid[]
    ),
    cm.created_at,
    cm.updated_at
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  left join public.profiles p on p.id = cm.user_id
  left join public.member_scopes ms
    on ms.company_id = cm.company_id
   and ms.member_id = cm.id
  where cm.company_id = p_company_id
  group by cm.id, cm.user_id, u.email, u.raw_user_meta_data, p.display_name,
           cm.role, cm.status, cm.created_at, cm.updated_at
  order by
    case cm.role when 'owner' then 1 when 'admin' then 2 when 'manager' then 3 else 4 end,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), u.email);
end;
$function$;

create or replace function public.activate_my_company_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.company_members cm
     set status = 'active',
         updated_at = now()
   where cm.user_id = v_user
     and cm.status = 'invited';

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.update_company_member(
  p_company_id uuid,
  p_member_id uuid,
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
  if p_role not in ('owner','admin','manager','staff') then
    raise exception 'Invalid member role';
  end if;
  if p_status not in ('invited','active','suspended') then
    raise exception 'Invalid member status';
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

  update public.company_members cm
     set role = p_role,
         status = p_status
   where cm.company_id = p_company_id
     and cm.id = p_member_id
  returning cm.id into v_member_id;

  if v_member_id is null then
    raise exception 'Company member not found';
  end if;

  delete from public.member_scopes ms
   where ms.company_id = p_company_id
     and ms.member_id = p_member_id;

  if p_role in ('manager','staff') then
    insert into public.member_scopes(company_id, member_id, branch_id)
    select p_company_id, p_member_id, branch_id
    from (
      select distinct unnest(coalesce(p_branch_ids, array[]::uuid[])) as branch_id
    ) selected
    where selected.branch_id is not null;
  end if;

  return v_member_id;
end;
$function$;

create or replace function public.remove_company_member(
  p_company_id uuid,
  p_member_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.company_members cm
   where cm.company_id = p_company_id
     and cm.id = p_member_id;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

revoke all on function public.list_company_members(uuid) from PUBLIC, anon;
revoke all on function public.activate_my_company_invitations() from PUBLIC, anon;
revoke all on function public.update_company_member(uuid, uuid, text, text, uuid[]) from PUBLIC, anon;
revoke all on function public.remove_company_member(uuid, uuid) from PUBLIC, anon;

grant execute on function public.list_company_members(uuid) to authenticated;
grant execute on function public.activate_my_company_invitations() to authenticated;
grant execute on function public.update_company_member(uuid, uuid, text, text, uuid[]) to authenticated;
grant execute on function public.remove_company_member(uuid, uuid) to authenticated;
