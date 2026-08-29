create table if not exists public.exchange_request_resolutions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  exchange_request_id uuid not null,
  exchange_request_item_id uuid not null,
  outcome text not null,
  accepted_quantity numeric not null,
  rejected_quantity numeric not null,
  replacement_quantity numeric not null default 0,
  replacement_unit_value numeric not null default 0,
  credit_amount numeric not null default 0,
  recovered_value numeric not null default 0,
  notes text,
  outbound_movement_id uuid,
  return_movement_id uuid,
  completed_by uuid not null,
  created_at timestamptz not null default now(),
  constraint exchange_request_resolutions_company_request_fkey
    foreign key (company_id, exchange_request_id)
    references public.exchange_requests (company_id, id)
    on delete restrict,
  constraint exchange_request_resolutions_company_item_fkey
    foreign key (company_id, exchange_request_item_id)
    references public.exchange_request_items (company_id, id)
    on delete restrict,
  constraint exchange_request_resolutions_outbound_movement_fkey
    foreign key (outbound_movement_id)
    references public.inventory_movements (id)
    on delete set null,
  constraint exchange_request_resolutions_return_movement_fkey
    foreign key (return_movement_id)
    references public.inventory_movements (id)
    on delete set null,
  constraint exchange_request_resolutions_completed_by_fkey
    foreign key (completed_by)
    references auth.users (id)
    on delete restrict,
  constraint exchange_request_resolutions_request_unique
    unique (company_id, exchange_request_id),
  constraint exchange_request_resolutions_item_unique
    unique (company_id, exchange_request_item_id),
  constraint exchange_request_resolutions_outcome_check
    check (outcome in ('replacement', 'credit', 'mixed')),
  constraint exchange_request_resolutions_accepted_quantity_check
    check (accepted_quantity > 0),
  constraint exchange_request_resolutions_rejected_quantity_check
    check (rejected_quantity >= 0),
  constraint exchange_request_resolutions_replacement_quantity_check
    check (replacement_quantity >= 0),
  constraint exchange_request_resolutions_replacement_unit_value_check
    check (replacement_unit_value >= 0),
  constraint exchange_request_resolutions_credit_amount_check
    check (credit_amount >= 0),
  constraint exchange_request_resolutions_recovered_value_check
    check (recovered_value >= 0),
  constraint exchange_request_resolutions_notes_length_check
    check (notes is null or char_length(notes) <= 2000)
);

create index if not exists exchange_request_resolutions_company_created_idx
  on public.exchange_request_resolutions (company_id, created_at desc);

alter table public.exchange_request_resolutions enable row level security;

revoke all on table public.exchange_request_resolutions from anon, authenticated;
grant select on table public.exchange_request_resolutions to authenticated, service_role;

drop policy if exists exchange_request_resolutions_select on public.exchange_request_resolutions;
create policy exchange_request_resolutions_select
  on public.exchange_request_resolutions
  for select
  to authenticated
  using (prazor_private.is_company_member(company_id));

drop trigger if exists prazor_audit_trigger on public.exchange_request_resolutions;
create trigger prazor_audit_trigger
  after insert or update or delete on public.exchange_request_resolutions
  for each row execute function prazor_private.capture_audit_log();

create or replace function public.complete_exchange_request(
  p_exchange_request_id uuid,
  p_outcome text,
  p_accepted_quantity numeric,
  p_replacement_quantity numeric default 0,
  p_replacement_unit_value numeric default 0,
  p_credit_amount numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request record;
  v_item record;
  v_item_count integer;
  v_agreement_outcome text;
  v_rejected_quantity numeric;
  v_recovered_value numeric;
  v_outbound_movement_id uuid;
  v_return_movement_id uuid;
  v_resolution_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select er.company_id, er.status, er.agreement_snapshot
  into v_request
  from public.exchange_requests er
  where er.id = p_exchange_request_id
  for update;

  if v_request.company_id is null then
    raise exception 'exchange request not found';
  end if;

  if not prazor_private.has_company_role(
    v_request.company_id,
    array['owner','admin','manager']
  ) then
    raise exception 'not authorized to complete exchange requests';
  end if;

  if v_request.status not in ('accepted','collected','sent') then
    raise exception 'exchange request is not ready for completion';
  end if;

  if exists (
    select 1
    from public.exchange_request_resolutions err
    where err.company_id = v_request.company_id
      and err.exchange_request_id = p_exchange_request_id
  ) then
    raise exception 'exchange request already completed';
  end if;

  select count(*)
  into v_item_count
  from public.exchange_request_items eri
  where eri.company_id = v_request.company_id
    and eri.exchange_request_id = p_exchange_request_id;

  if v_item_count <> 1 then
    raise exception 'exchange request must contain exactly one item';
  end if;

  select eri.id, eri.batch_id, eri.stock_location_id, eri.quantity,
         eri.unit_value, eri.inventory_movement_id
  into v_item
  from public.exchange_request_items eri
  where eri.company_id = v_request.company_id
    and eri.exchange_request_id = p_exchange_request_id
  for update;

  if v_item.stock_location_id is null then
    raise exception 'exchange item has no stock location';
  end if;

  if p_accepted_quantity is null
     or p_accepted_quantity <= 0
     or p_accepted_quantity > v_item.quantity then
    raise exception 'invalid accepted exchange quantity';
  end if;

  if p_outcome not in ('replacement','credit','mixed') then
    raise exception 'invalid exchange outcome';
  end if;

  if coalesce(p_replacement_quantity, 0) < 0
     or coalesce(p_replacement_unit_value, 0) < 0
     or coalesce(p_credit_amount, 0) < 0 then
    raise exception 'exchange recovery values must be non-negative';
  end if;

  if char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'exchange resolution notes too long';
  end if;

  v_agreement_outcome := coalesce(
    nullif(v_request.agreement_snapshot ->> 'exchangeOutcome', ''),
    'either'
  );

  if v_agreement_outcome = 'replacement' and p_outcome <> 'replacement' then
    raise exception 'supplier agreement allows replacement only';
  end if;

  if v_agreement_outcome = 'credit' and p_outcome <> 'credit' then
    raise exception 'supplier agreement allows credit only';
  end if;

  if p_outcome = 'replacement' and (
    coalesce(p_replacement_quantity, 0) <= 0
    or coalesce(p_credit_amount, 0) <> 0
  ) then
    raise exception 'replacement outcome requires replacement quantity only';
  end if;

  if p_outcome = 'credit' and (
    coalesce(p_credit_amount, 0) <= 0
    or coalesce(p_replacement_quantity, 0) <> 0
  ) then
    raise exception 'credit outcome requires credit amount only';
  end if;

  if p_outcome = 'mixed' and (
    v_agreement_outcome <> 'either'
    or coalesce(p_replacement_quantity, 0) <= 0
    or coalesce(p_credit_amount, 0) <= 0
  ) then
    raise exception 'mixed outcome requires replacement and credit';
  end if;

  v_rejected_quantity := v_item.quantity - p_accepted_quantity;
  v_recovered_value := round(
    coalesce(p_replacement_quantity, 0) * coalesce(p_replacement_unit_value, 0)
      + coalesce(p_credit_amount, 0),
    2
  );

  if v_item.inventory_movement_id is null then
    v_outbound_movement_id := prazor_private.post_inventory_movement_internal(
      v_request.company_id,
      v_item.batch_id,
      'exchange',
      p_accepted_quantity,
      v_item.stock_location_id,
      null,
      'Saída concluída por troca com fornecedor',
      'exchange_request',
      p_exchange_request_id
    );

    update public.exchange_request_items
    set inventory_movement_id = v_outbound_movement_id
    where id = v_item.id;
  else
    v_outbound_movement_id := v_item.inventory_movement_id;

    if v_rejected_quantity > 0 then
      v_return_movement_id := prazor_private.post_inventory_movement_internal(
        v_request.company_id,
        v_item.batch_id,
        'return',
        v_rejected_quantity,
        null,
        v_item.stock_location_id,
        'Retorno da quantidade não aceita na troca',
        'exchange_request',
        p_exchange_request_id
      );
    end if;
  end if;

  insert into public.exchange_request_resolutions (
    company_id,
    exchange_request_id,
    exchange_request_item_id,
    outcome,
    accepted_quantity,
    rejected_quantity,
    replacement_quantity,
    replacement_unit_value,
    credit_amount,
    recovered_value,
    notes,
    outbound_movement_id,
    return_movement_id,
    completed_by
  ) values (
    v_request.company_id,
    p_exchange_request_id,
    v_item.id,
    p_outcome,
    p_accepted_quantity,
    v_rejected_quantity,
    coalesce(p_replacement_quantity, 0),
    coalesce(p_replacement_unit_value, 0),
    coalesce(p_credit_amount, 0),
    v_recovered_value,
    nullif(trim(p_notes), ''),
    v_outbound_movement_id,
    v_return_movement_id,
    v_user_id
  )
  returning id into v_resolution_id;

  update public.exchange_requests
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      reservation_released_at = coalesce(reservation_released_at, now()),
      updated_at = now()
  where id = p_exchange_request_id;

  return v_resolution_id;
end;
$$;

revoke all on function public.complete_exchange_request(uuid, text, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.complete_exchange_request(uuid, text, numeric, numeric, numeric, numeric, text) to authenticated, service_role;

create or replace function public.update_exchange_status(
  p_exchange_request_id uuid,
  p_status text,
  p_protocol text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_old_status text;
  v_existing_protocol text;
  v_effective_protocol text;
  v_movement_id uuid;
  v_item record;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_status not in (
    'eligible','preparing','requested','accepted','rejected',
    'collected','sent','completed','cancelled'
  ) then
    raise exception 'invalid exchange status';
  end if;

  if p_status = 'completed' then
    raise exception 'use the dedicated exchange completion operation';
  end if;

  if p_protocol is not null and (
    char_length(trim(p_protocol)) < 1 or char_length(trim(p_protocol)) > 120
  ) then
    raise exception 'invalid exchange protocol';
  end if;

  select er.company_id, er.status, er.protocol
  into v_company_id, v_old_status, v_existing_protocol
  from public.exchange_requests er
  where er.id = p_exchange_request_id
  for update;

  if v_company_id is null then
    raise exception 'exchange request not found';
  end if;

  if not prazor_private.has_company_role(
    v_company_id,
    array['owner','admin','manager']
  ) then
    raise exception 'not authorized to update exchange requests';
  end if;

  if p_status <> v_old_status and not (
    (v_old_status = 'eligible' and p_status in ('preparing','requested','cancelled'))
    or (v_old_status = 'preparing' and p_status in ('requested','cancelled'))
    or (v_old_status = 'requested' and p_status in ('accepted','rejected','cancelled'))
    or (v_old_status = 'accepted' and p_status in ('collected','sent','cancelled'))
    or (v_old_status = 'collected' and p_status = 'sent')
  ) then
    raise exception 'invalid exchange status transition from % to %',
      v_old_status,
      p_status;
  end if;

  v_effective_protocol := coalesce(nullif(trim(p_protocol), ''), v_existing_protocol);
  if p_status = 'requested' and v_effective_protocol is null then
    raise exception 'protocol required to submit exchange request';
  end if;

  if p_status in ('collected','sent') then
    for v_item in
      select eri.id, eri.batch_id, eri.stock_location_id,
             eri.quantity, eri.inventory_movement_id
      from public.exchange_request_items eri
      where eri.exchange_request_id = p_exchange_request_id
        and eri.company_id = v_company_id
      for update
    loop
      if v_item.stock_location_id is null then
        raise exception 'exchange item has no stock location';
      end if;

      if v_item.inventory_movement_id is null then
        v_movement_id := prazor_private.post_inventory_movement_internal(
          v_company_id,
          v_item.batch_id,
          'exchange',
          v_item.quantity,
          v_item.stock_location_id,
          null,
          'Saída por troca com fornecedor',
          'exchange_request',
          p_exchange_request_id
        );

        update public.exchange_request_items
        set inventory_movement_id = v_movement_id
        where id = v_item.id;
      end if;
    end loop;
  end if;

  update public.exchange_requests
  set status = p_status,
      protocol = v_effective_protocol,
      requested_at = case
        when p_status = 'requested' then coalesce(requested_at, now())
        else requested_at
      end,
      reservation_released_at = case
        when p_status in ('rejected','cancelled','collected','sent')
          then coalesce(reservation_released_at, now())
        else reservation_released_at
      end,
      updated_at = now()
  where id = p_exchange_request_id;
end;
$$;

revoke all on function public.update_exchange_status(uuid, text, text) from public, anon;
grant execute on function public.update_exchange_status(uuid, text, text) to authenticated, service_role;
