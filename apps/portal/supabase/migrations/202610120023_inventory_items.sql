begin;

-- ============================================================
-- BESTEMD 023 - INVENTARIS
-- Bedrijfsmiddelen strikt per onderneming.
-- ============================================================

create table if not exists
public.inventory_items (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id),

  category text not null,

  name text not null,

  description text,

  purchase_date date,

  purchase_value_cents bigint,

  book_value_cents bigint,

  make text,

  model text,

  license_plate text,

  serial_number text,

  odometer_km integer,

  location text,

  status text not null
    default 'active',

  notes text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  archived_at timestamptz,

  constraint inventory_items_category_check
    check (
      category in (
        'vehicle',
        'equipment',
        'ict',
        'furniture',
        'other'
      )
    ),

  constraint inventory_items_status_check
    check (
      status in (
        'active',
        'sold',
        'disposed'
      )
    ),

  constraint inventory_items_name_check
    check (
      char_length(trim(name))
      between 2 and 160
    ),

  constraint inventory_items_purchase_value_check
    check (
      purchase_value_cents is null
      or purchase_value_cents >= 0
    ),

  constraint inventory_items_book_value_check
    check (
      book_value_cents is null
      or book_value_cents >= 0
    ),

  constraint inventory_items_odometer_check
    check (
      odometer_km is null
      or odometer_km >= 0
    )
);


create index if not exists
inventory_items_org_active_idx
on public.inventory_items (
  organization_id,
  category,
  name
)
where archived_at is null;


alter table
public.inventory_items
enable row level security;


drop policy if exists
inventory_items_read
on public.inventory_items;


create policy
inventory_items_read
on public.inventory_items
for select
to authenticated
using (
  archived_at is null
  and public.has_aal2()
  and (
    public.has_org_access(
      organization_id
    )
    or public.is_office_user()
  )
);


revoke insert, update, delete, truncate
on public.inventory_items
from anon, authenticated;


grant select
on public.inventory_items
to authenticated;



-- ============================================================
-- BEVOEGDHEID
-- ============================================================

create or replace function
public.can_customer_manage_inventory(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null

    and public.has_aal2()

    and exists (
      select 1
      from public.organization_memberships m

      join public.roles r
        on r.id = m.role_id
       and r.scope = 'customer'

      join public.profiles p
        on p.id = m.user_id

      join public.organizations o
        on o.id = m.organization_id

      where
        m.user_id = auth.uid()

        and m.organization_id =
          p_organization_id

        and m.status = 'active'

        and m.valid_from <= now()

        and (
          m.valid_until is null
          or m.valid_until > now()
        )

        and p.account_status = 'active'

        and o.archived_at is null

        and r.code in (
          'owner',
          'admin',
          'finance'
        )
    );
$$;


revoke all
on function
public.can_customer_manage_inventory(uuid)
from public, anon;

grant execute
on function
public.can_customer_manage_inventory(uuid)
to authenticated;



-- ============================================================
-- INVENTARIS LEZEN
-- ============================================================

create or replace function
public.get_customer_inventory(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin

  if auth.uid() is null then
    raise exception
      'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;

  if not (
    public.has_org_access(
      p_organization_id
    )
    or public.is_office_user()
  ) then
    raise exception
      'Geen toegang tot deze onderneming.';
  end if;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          i.id,

        'category',
          i.category,

        'name',
          i.name,

        'description',
          i.description,

        'purchaseDate',
          i.purchase_date,

        'purchaseValueCents',
          i.purchase_value_cents,

        'bookValueCents',
          i.book_value_cents,

        'make',
          i.make,

        'model',
          i.model,

        'licensePlate',
          i.license_plate,

        'serialNumber',
          i.serial_number,

        'odometerKm',
          i.odometer_km,

        'location',
          i.location,

        'status',
          i.status,

        'notes',
          i.notes,

        'createdAt',
          i.created_at,

        'updatedAt',
          i.updated_at
      )
      order by
        lower(i.name),
        i.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.inventory_items i
  where
    i.organization_id =
      p_organization_id

    and i.archived_at is null;


  return v_result;

end;
$$;


revoke all
on function
public.get_customer_inventory(uuid)
from public, anon;

grant execute
on function
public.get_customer_inventory(uuid)
to authenticated;



-- ============================================================
-- INVENTARIS TOEVOEGEN
-- ============================================================

create or replace function
public.customer_create_inventory_item(
  p_organization_id uuid,
  p_category text,
  p_name text,
  p_description text,
  p_purchase_date date,
  p_purchase_value_cents bigint,
  p_book_value_cents bigint,
  p_make text,
  p_model text,
  p_license_plate text,
  p_serial_number text,
  p_odometer_km integer,
  p_location text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin

  if not public.can_customer_manage_inventory(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om inventaris te beheren.';
  end if;


  v_name :=
    trim(
      coalesce(
        p_name,
        ''
      )
    );


  if length(v_name) < 2
     or length(v_name) > 160
  then
    raise exception
      'Naam is ongeldig.';
  end if;


  if p_category not in (
    'vehicle',
    'equipment',
    'ict',
    'furniture',
    'other'
  ) then
    raise exception
      'Categorie is ongeldig.';
  end if;


  if
    p_purchase_value_cents is not null
    and p_purchase_value_cents < 0
  then
    raise exception
      'Aanschafwaarde is ongeldig.';
  end if;


  if
    p_book_value_cents is not null
    and p_book_value_cents < 0
  then
    raise exception
      'Boekwaarde is ongeldig.';
  end if;


  if
    p_odometer_km is not null
    and p_odometer_km < 0
  then
    raise exception
      'Kilometerstand is ongeldig.';
  end if;


  insert into public.inventory_items (
    organization_id,
    category,
    name,
    description,
    purchase_date,
    purchase_value_cents,
    book_value_cents,
    make,
    model,
    license_plate,
    serial_number,
    odometer_km,
    location,
    notes
  )
  values (
    p_organization_id,
    p_category,
    v_name,
    nullif(trim(coalesce(p_description,'')), ''),
    p_purchase_date,
    p_purchase_value_cents,
    p_book_value_cents,
    nullif(trim(coalesce(p_make,'')), ''),
    nullif(trim(coalesce(p_model,'')), ''),
    nullif(upper(trim(coalesce(p_license_plate,''))), ''),
    nullif(trim(coalesce(p_serial_number,'')), ''),
    p_odometer_km,
    nullif(trim(coalesce(p_location,'')), ''),
    nullif(trim(coalesce(p_notes,'')), '')
  )
  returning id
  into v_id;


  insert into public.audit_events (
    actor_id,
    organization_id,
    action,
    object_type,
    object_id,
    result,
    metadata
  )
  values (
    auth.uid(),
    p_organization_id,
    'inventory.item_created',
    'inventory_item',
    v_id,
    'success',
    jsonb_build_object(
      'category',
      p_category,
      'name',
      v_name
    )
  );


  return v_id;

end;
$$;


revoke all
on function
public.customer_create_inventory_item(
  uuid,
  text,
  text,
  text,
  date,
  bigint,
  bigint,
  text,
  text,
  text,
  text,
  integer,
  text,
  text
)
from public, anon;


grant execute
on function
public.customer_create_inventory_item(
  uuid,
  text,
  text,
  text,
  date,
  bigint,
  bigint,
  text,
  text,
  text,
  text,
  integer,
  text,
  text
)
to authenticated;


commit;
