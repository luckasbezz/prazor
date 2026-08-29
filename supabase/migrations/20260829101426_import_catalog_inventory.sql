alter table public.imports
  add column if not exists source_hash text,
  add column if not exists created_products integer not null default 0,
  add column if not exists updated_products integer not null default 0,
  add column if not exists received_lots integer not null default 0,
  add column if not exists result jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'imports_source_hash_check'
      and conrelid = 'public.imports'::regclass
  ) then
    alter table public.imports
      add constraint imports_source_hash_check
      check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

create unique index if not exists imports_company_source_hash_uidx
  on public.imports (company_id, source_hash)
  where source_hash is not null;

create index if not exists import_errors_import_row_idx
  on public.import_errors (import_id, row_number);

drop policy if exists imports_insert on public.imports;
drop policy if exists imports_update on public.imports;

revoke insert, update, delete, truncate, references, trigger
  on public.imports, public.import_errors
  from anon, authenticated;

grant select on public.imports, public.import_errors to authenticated;

create or replace function public.import_catalog_inventory(
  p_company_id uuid,
  p_filename text,
  p_source_hash text,
  p_rows jsonb,
  p_mapping jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_total integer;
  v_import_id uuid;
  v_existing_result jsonb;
  v_existing_status text;
  v_row jsonb;
  v_row_number integer := 0;
  v_name text;
  v_sku text;
  v_sku_key text;
  v_barcode text;
  v_unit text;
  v_batch_code text;
  v_branch_name text;
  v_location_name text;
  v_supplier_name text;
  v_expiration_date date;
  v_manufacture_date date;
  v_cost_price numeric;
  v_sale_price numeric;
  v_quantity numeric;
  v_has_inventory boolean;
  v_product_id uuid;
  v_barcode_product_id uuid;
  v_branch_id uuid;
  v_location_id uuid;
  v_supplier_id uuid;
  v_batch_id uuid;
  v_movement_id uuid;
  v_was_existing boolean;
  v_seen_skus text[] := array[]::text[];
  v_created_products integer := 0;
  v_updated_products integer := 0;
  v_received_lots integer := 0;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not prazor_private.has_company_role(
    p_company_id,
    array['owner', 'admin', 'manager']
  ) then
    raise exception 'Only managers can import inventory';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Import rows must be a JSON array';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total < 1 or v_total > 500 then
    raise exception 'Import must contain between 1 and 500 rows';
  end if;

  if p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid import source hash';
  end if;

  if nullif(trim(p_filename), '') is null or char_length(trim(p_filename)) > 180 then
    raise exception 'Invalid import filename';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':' || p_source_hash, 0)
  );

  select i.status, i.result
    into v_existing_status, v_existing_result
    from public.imports i
   where i.company_id = p_company_id
     and i.source_hash = p_source_hash
   limit 1
   for update;

  if found then
    if v_existing_status = 'completed' then
      return coalesce(v_existing_result, '{}'::jsonb)
        || jsonb_build_object('duplicate', true);
    end if;
    raise exception 'Import is already being processed';
  end if;

  if exists (
    select 1
    from (
      select
        lower(trim(item->>'sku')) as sku_key,
        count(distinct concat_ws(
          '|',
          lower(trim(item->>'name')),
          lower(trim(item->>'unit')),
          coalesce(trim(item->>'barcode'), ''),
          coalesce(trim(item->>'costPrice'), ''),
          coalesce(trim(item->>'salePrice'), '')
        )) as variants
      from jsonb_array_elements(p_rows) item
      group by lower(trim(item->>'sku'))
    ) grouped
    where grouped.variants > 1
  ) then
    raise exception 'The same SKU has conflicting product data';
  end if;

  if exists (
    select 1
    from (
      select
        lower(trim(item->>'sku')),
        lower(trim(item->>'batchCode')),
        trim(item->>'expirationDate'),
        lower(trim(item->>'branchName')),
        lower(trim(item->>'locationName')),
        lower(coalesce(trim(item->>'supplierName'), '')),
        count(*)
      from jsonb_array_elements(p_rows) item
      where coalesce((item->>'hasInventory')::boolean, false)
      group by
        lower(trim(item->>'sku')),
        lower(trim(item->>'batchCode')),
        trim(item->>'expirationDate'),
        lower(trim(item->>'branchName')),
        lower(trim(item->>'locationName')),
        lower(coalesce(trim(item->>'supplierName'), ''))
      having count(*) > 1
    ) duplicated_lots
  ) then
    raise exception 'The same lot and location appear more than once in the import';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := v_row_number + 1;

    if jsonb_typeof(v_row) is distinct from 'object' then
      raise exception 'Invalid data at row %', v_row_number;
    end if;

    v_name := nullif(trim(v_row->>'name'), '');
    v_sku := nullif(trim(v_row->>'sku'), '');
    v_sku_key := lower(v_sku);
    v_barcode := nullif(regexp_replace(trim(v_row->>'barcode'), '\s+', '', 'g'), '');
    v_unit := lower(coalesce(nullif(trim(v_row->>'unit'), ''), 'un'));
    v_batch_code := nullif(trim(v_row->>'batchCode'), '');
    v_branch_name := nullif(trim(v_row->>'branchName'), '');
    v_location_name := nullif(trim(v_row->>'locationName'), '');
    v_supplier_name := nullif(trim(v_row->>'supplierName'), '');
    v_has_inventory := coalesce((v_row->>'hasInventory')::boolean, false);

    if jsonb_typeof(v_row->'costPrice') not in ('number', 'null')
       or jsonb_typeof(v_row->'salePrice') not in ('number', 'null')
       or jsonb_typeof(v_row->'quantity') not in ('number', 'null') then
      raise exception 'Invalid numeric value at row %', v_row_number;
    end if;

    v_cost_price := nullif(v_row->>'costPrice', '')::numeric;
    v_sale_price := nullif(v_row->>'salePrice', '')::numeric;
    v_quantity := nullif(v_row->>'quantity', '')::numeric;
    v_expiration_date := nullif(v_row->>'expirationDate', '')::date;
    v_manufacture_date := nullif(v_row->>'manufactureDate', '')::date;

    if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 180 then
      raise exception 'Invalid product name at row %', v_row_number;
    end if;

    if v_sku is null or char_length(v_sku) > 80 then
      raise exception 'Invalid SKU at row %', v_row_number;
    end if;

    if v_unit not in ('un', 'kg', 'g', 'l', 'ml', 'cx', 'pct') then
      raise exception 'Invalid product unit at row %', v_row_number;
    end if;

    if v_barcode is not null and (
      char_length(v_barcode) < 4
      or char_length(v_barcode) > 64
      or v_barcode !~ '^[0-9A-Za-z._-]+$'
    ) then
      raise exception 'Invalid barcode at row %', v_row_number;
    end if;

    if v_cost_price is not null and v_cost_price < 0 then
      raise exception 'Invalid cost price at row %', v_row_number;
    end if;

    if v_sale_price is not null and v_sale_price < 0 then
      raise exception 'Invalid sale price at row %', v_row_number;
    end if;

    select p.id
      into v_product_id
      from public.products p
     where p.company_id = p_company_id
       and lower(p.sku) = v_sku_key
       and p.active
     limit 1;

    if v_product_id is null and exists (
      select 1
      from public.products p
      where p.company_id = p_company_id
        and lower(p.sku) = v_sku_key
        and not p.active
    ) then
      raise exception 'Inactive product at row %', v_row_number;
    end if;

    if v_barcode is not null then
      select pb.product_id
        into v_barcode_product_id
        from public.product_barcodes pb
       where pb.company_id = p_company_id
         and pb.barcode = v_barcode
       limit 1;

      if v_barcode_product_id is not null
         and v_barcode_product_id is distinct from v_product_id then
        raise exception 'Barcode belongs to another product at row %', v_row_number;
      end if;
    end if;

    if v_has_inventory then
      if v_batch_code is null or char_length(v_batch_code) > 100 then
        raise exception 'Invalid batch code at row %', v_row_number;
      end if;

      if v_expiration_date is null or v_expiration_date < current_date then
        raise exception 'Invalid expiration date at row %', v_row_number;
      end if;

      if v_manufacture_date is not null and v_manufacture_date > v_expiration_date then
        raise exception 'Manufacture date is after expiration at row %', v_row_number;
      end if;

      if v_quantity is null or v_quantity <= 0 then
        raise exception 'Invalid quantity at row %', v_row_number;
      end if;

      if v_cost_price is null then
        raise exception 'Cost price is required for inventory at row %', v_row_number;
      end if;

      select b.id
        into v_branch_id
        from public.branches b
       where b.company_id = p_company_id
         and b.active
         and lower(b.name) = lower(v_branch_name)
       limit 1;

      if v_branch_id is null then
        raise exception 'Branch not found at row %', v_row_number;
      end if;

      select sl.id
        into v_location_id
        from public.stock_locations sl
       where sl.company_id = p_company_id
         and sl.branch_id = v_branch_id
         and sl.active
         and lower(sl.name) = lower(v_location_name)
       limit 1;

      if v_location_id is null
         or not prazor_private.can_access_location(p_company_id, v_location_id) then
        raise exception 'Stock location access denied at row %', v_row_number;
      end if;

      v_supplier_id := null;
      if v_supplier_name is not null then
        select s.id
          into v_supplier_id
          from public.suppliers s
         where s.company_id = p_company_id
           and s.active
           and lower(s.name) = lower(v_supplier_name)
         limit 1;

        if v_supplier_id is null then
          raise exception 'Supplier not found at row %', v_row_number;
        end if;
      end if;
    end if;
  end loop;

  insert into public.imports (
    company_id,
    user_id,
    filename,
    status,
    total_rows,
    valid_rows,
    invalid_rows,
    mapping,
    source_hash
  )
  values (
    p_company_id,
    v_user,
    trim(p_filename),
    'processing',
    v_total,
    v_total,
    0,
    coalesce(p_mapping, '{}'::jsonb),
    p_source_hash
  )
  returning id into v_import_id;

  v_row_number := 0;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := v_row_number + 1;
    v_name := trim(v_row->>'name');
    v_sku := trim(v_row->>'sku');
    v_sku_key := lower(v_sku);
    v_barcode := nullif(regexp_replace(trim(v_row->>'barcode'), '\s+', '', 'g'), '');
    v_unit := lower(coalesce(nullif(trim(v_row->>'unit'), ''), 'un'));
    v_cost_price := nullif(v_row->>'costPrice', '')::numeric;
    v_sale_price := nullif(v_row->>'salePrice', '')::numeric;
    v_has_inventory := coalesce((v_row->>'hasInventory')::boolean, false);

    select p.id
      into v_product_id
      from public.products p
     where p.company_id = p_company_id
       and lower(p.sku) = v_sku_key
       and p.active
     limit 1
     for update;

    v_was_existing := v_product_id is not null;

    if v_product_id is null then
      insert into public.products (
        company_id, name, sku, unit, cost_price, sale_price
      )
      values (
        p_company_id, v_name, v_sku, v_unit, v_cost_price, v_sale_price
      )
      returning id into v_product_id;
    else
      update public.products
         set name = v_name,
             unit = v_unit,
             cost_price = coalesce(v_cost_price, cost_price),
             sale_price = coalesce(v_sale_price, sale_price),
             updated_at = now()
       where id = v_product_id;
    end if;

    if not (v_sku_key = any(v_seen_skus)) then
      if v_was_existing then
        v_updated_products := v_updated_products + 1;
      else
        v_created_products := v_created_products + 1;
      end if;
      v_seen_skus := array_append(v_seen_skus, v_sku_key);
    end if;

    if v_barcode is not null and not exists (
      select 1
      from public.product_barcodes pb
      where pb.company_id = p_company_id
        and pb.barcode = v_barcode
    ) then
      insert into public.product_barcodes (
        company_id, product_id, barcode, is_primary
      )
      values (
        p_company_id,
        v_product_id,
        v_barcode,
        not exists (
          select 1
          from public.product_barcodes pb
          where pb.company_id = p_company_id
            and pb.product_id = v_product_id
        )
      );
    end if;

    if v_has_inventory then
      v_batch_code := trim(v_row->>'batchCode');
      v_expiration_date := (v_row->>'expirationDate')::date;
      v_manufacture_date := nullif(v_row->>'manufactureDate', '')::date;
      v_quantity := (v_row->>'quantity')::numeric;
      v_branch_name := trim(v_row->>'branchName');
      v_location_name := trim(v_row->>'locationName');
      v_supplier_name := nullif(trim(v_row->>'supplierName'), '');

      select b.id
        into v_branch_id
        from public.branches b
       where b.company_id = p_company_id
         and b.active
         and lower(b.name) = lower(v_branch_name)
       limit 1;

      select sl.id
        into v_location_id
        from public.stock_locations sl
       where sl.company_id = p_company_id
         and sl.branch_id = v_branch_id
         and sl.active
         and lower(sl.name) = lower(v_location_name)
       limit 1;

      v_supplier_id := null;
      if v_supplier_name is not null then
        select s.id
          into v_supplier_id
          from public.suppliers s
         where s.company_id = p_company_id
           and s.active
           and lower(s.name) = lower(v_supplier_name)
         limit 1;
      end if;

      select b.id
        into v_batch_id
        from public.batches b
       where b.company_id = p_company_id
         and b.product_id = v_product_id
         and b.batch_code = v_batch_code
         and b.expiration_date = v_expiration_date
         and b.supplier_id is not distinct from v_supplier_id
         and b.cost_price is not distinct from v_cost_price
         and b.status = 'active'
       order by b.created_at
       limit 1
       for update;

      if v_batch_id is null then
        insert into public.batches (
          company_id,
          product_id,
          supplier_id,
          batch_code,
          manufacture_date,
          expiration_date,
          received_at,
          cost_price,
          status
        )
        values (
          p_company_id,
          v_product_id,
          v_supplier_id,
          v_batch_code,
          v_manufacture_date,
          v_expiration_date,
          now(),
          v_cost_price,
          'active'
        )
        returning id into v_batch_id;
      end if;

      v_movement_id := prazor_private.post_inventory_movement_internal(
        p_company_id,
        v_batch_id,
        'entry',
        v_quantity,
        null,
        v_location_id,
        'Entrada por importação de planilha',
        'import',
        v_import_id
      );

      v_received_lots := v_received_lots + 1;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'importId', v_import_id,
    'totalRows', v_total,
    'createdProducts', v_created_products,
    'updatedProducts', v_updated_products,
    'receivedLots', v_received_lots,
    'duplicate', false
  );

  update public.imports
     set status = 'completed',
         created_products = v_created_products,
         updated_products = v_updated_products,
         received_lots = v_received_lots,
         result = v_result,
         completed_at = now()
   where id = v_import_id;

  return v_result;
end;
$$;

revoke all on function public.import_catalog_inventory(uuid, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.import_catalog_inventory(uuid, text, text, jsonb, jsonb)
  to authenticated;
