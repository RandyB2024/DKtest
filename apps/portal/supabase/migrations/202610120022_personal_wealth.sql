begin;


create table
if not exists public.personal_wealth_items (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  item_type text not null
    check (
      item_type in (
        'asset',
        'liability'
      )
    ),

  category text not null
    check (
      category in (
        'cash',
        'savings',
        'investments',
        'pension',
        'property',
        'vehicle',
        'business',
        'mortgage',
        'loan',
        'tax',
        'credit',
        'other'
      )
    ),

  name text not null,

  institution text,

  current_value_cents bigint
    not null default 0
    check (
      current_value_cents >= 0
    ),

  reference_date date
    not null default current_date,

  notes text,

  position integer
    not null default 0
    check (
      position >= 0
      and position <= 10000
    ),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint personal_wealth_name_length
    check (
      length(btrim(name))
      between 1 and 200
    ),

  constraint personal_wealth_institution_length
    check (
      institution is null
      or length(institution) <= 200
    ),

  constraint personal_wealth_notes_length
    check (
      notes is null
      or length(notes) <= 5000
    )
);


create index
if not exists personal_wealth_items_user_idx
on public.personal_wealth_items (
  user_id,
  item_type,
  position,
  created_at
);


alter table
public.personal_wealth_items
enable row level security;


revoke all
on public.personal_wealth_items
from anon, authenticated;


-- ============================================================
-- AUDIT TYPE UITBREIDEN
-- ============================================================

alter table
public.personal_portal_data_audit
drop constraint if exists
personal_portal_data_audit_entity_type_check;


alter table
public.personal_portal_data_audit
add constraint
personal_portal_data_audit_entity_type_check
check (
  entity_type in (
    'life_plan',
    'life_goal',
    'coaching_entry',
    'abc',
    'wealth_item'
  )
);


-- ============================================================
-- MIJN VERMOGEN LEZEN
-- ============================================================

create or replace function
public.personal_wealth_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_items jsonb;
  v_assets bigint;
  v_liabilities bigint;
begin

  v_actor :=
    public.personal_portal_actor();


  select coalesce(
    sum(
      case
        when item_type = 'asset'
          then current_value_cents
        else 0
      end
    ),
    0
  )
  into v_assets
  from public.personal_wealth_items
  where user_id =
    v_actor;


  select coalesce(
    sum(
      case
        when item_type = 'liability'
          then current_value_cents
        else 0
      end
    ),
    0
  )
  into v_liabilities
  from public.personal_wealth_items
  where user_id =
    v_actor;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          item.id,

        'itemType',
          item.item_type,

        'category',
          item.category,

        'name',
          item.name,

        'institution',
          item.institution,

        'currentValueCents',
          item.current_value_cents,

        'referenceDate',
          item.reference_date,

        'notes',
          item.notes,

        'position',
          item.position,

        'updatedAt',
          item.updated_at
      )
      order by
        item.item_type,
        item.position,
        item.created_at
    ),
    '[]'::jsonb
  )
  into v_items
  from public.personal_wealth_items item
  where item.user_id =
    v_actor;


  return jsonb_build_object(
    'assetsCents',
      v_assets,

    'liabilitiesCents',
      v_liabilities,

    'netWorthCents',
      v_assets - v_liabilities,

    'items',
      v_items
  );
end;
$$;


-- ============================================================
-- ITEM OPSLAAN
-- ============================================================

create or replace function
public.personal_wealth_item_save(
  p_item_id uuid,
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;

  v_type text;
  v_category text;
  v_name text;
  v_institution text;
  v_value bigint;
  v_reference_date date;
  v_notes text;
  v_position integer;
begin

  v_actor :=
    public.personal_portal_actor();


  if p_input is null
     or jsonb_typeof(p_input) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message =
        'Ongeldige vermogensgegevens.';
  end if;


  v_type :=
    p_input ->> 'itemType';

  v_category :=
    p_input ->> 'category';

  v_name :=
    btrim(
      coalesce(
        p_input ->> 'name',
        ''
      )
    );

  v_institution :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'institution',
          ''
        )
      ),
      ''
    );

  v_notes :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'notes',
          ''
        )
      ),
      ''
    );


  if v_type not in (
    'asset',
    'liability'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Ongeldig type vermogenspost.';
  end if;


  if v_category not in (
    'cash',
    'savings',
    'investments',
    'pension',
    'property',
    'vehicle',
    'business',
    'mortgage',
    'loan',
    'tax',
    'credit',
    'other'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Ongeldige categorie.';
  end if;


  if length(v_name)
     not between 1 and 200
  then
    raise exception using
      errcode = '22023',
      message =
        'Naam van vermogenspost is ongeldig.';
  end if;


  if length(
    coalesce(
      v_institution,
      ''
    )
  ) > 200
  then
    raise exception using
      errcode = '22023',
      message =
        'Naam van instelling is te lang.';
  end if;


  if length(
    coalesce(
      v_notes,
      ''
    )
  ) > 5000
  then
    raise exception using
      errcode = '22023',
      message =
        'Notitie is te lang.';
  end if;


  begin

    v_value :=
      coalesce(
        (
          p_input ->>
          'currentValueCents'
        )::bigint,
        0
      );

    v_reference_date :=
      coalesce(
        nullif(
          p_input ->>
          'referenceDate',
          ''
        )::date,
        current_date
      );

    v_position :=
      coalesce(
        (
          p_input ->>
          'position'
        )::integer,
        0
      );

  exception
    when others then
      raise exception using
        errcode = '22023',
        message =
          'Ongeldige vermogensgegevens.';
  end;


  if v_value < 0
  then
    raise exception using
      errcode = '22023',
      message =
        'Een bedrag mag niet negatief zijn.';
  end if;


  if v_position < 0
     or v_position > 10000
  then
    raise exception using
      errcode = '22023',
      message =
        'Ongeldige positie.';
  end if;


  if p_item_id is null then

    insert into
    public.personal_wealth_items (
      user_id,
      item_type,
      category,
      name,
      institution,
      current_value_cents,
      reference_date,
      notes,
      position
    )
    values (
      v_actor,
      v_type,
      v_category,
      v_name,
      v_institution,
      v_value,
      v_reference_date,
      v_notes,
      v_position
    )
    returning id
    into v_id;


    insert into
    public.personal_portal_data_audit (
      user_id,
      entity_type,
      entity_id,
      action
    )
    values (
      v_actor,
      'wealth_item',
      v_id,
      'created'
    );

  else

    update
    public.personal_wealth_items
    set
      item_type =
        v_type,

      category =
        v_category,

      name =
        v_name,

      institution =
        v_institution,

      current_value_cents =
        v_value,

      reference_date =
        v_reference_date,

      notes =
        v_notes,

      position =
        v_position,

      updated_at =
        now()

    where id =
      p_item_id

      and user_id =
        v_actor

    returning id
    into v_id;


    if v_id is null then
      raise exception using
        errcode = 'P0002',
        message =
          'Vermogenspost niet gevonden.';
    end if;


    insert into
    public.personal_portal_data_audit (
      user_id,
      entity_type,
      entity_id,
      action
    )
    values (
      v_actor,
      'wealth_item',
      v_id,
      'updated'
    );

  end if;


  return v_id;
end;
$$;


-- ============================================================
-- ITEM VERWIJDEREN
-- ============================================================

create or replace function
public.personal_wealth_item_delete(
  p_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;
begin

  v_actor :=
    public.personal_portal_actor();


  delete from
  public.personal_wealth_items

  where id =
    p_item_id

    and user_id =
      v_actor

  returning id
  into v_id;


  if v_id is null then
    raise exception using
      errcode = 'P0002',
      message =
        'Vermogenspost niet gevonden.';
  end if;


  insert into
  public.personal_portal_data_audit (
    user_id,
    entity_type,
    entity_id,
    action
  )
  values (
    v_actor,
    'wealth_item',
    v_id,
    'deleted'
  );


  return v_id;
end;
$$;


revoke all
on function
  public.personal_wealth_get(),
  public.personal_wealth_item_save(uuid,jsonb),
  public.personal_wealth_item_delete(uuid)
from public, anon;


grant execute
on function
  public.personal_wealth_get(),
  public.personal_wealth_item_save(uuid,jsonb),
  public.personal_wealth_item_delete(uuid)
to authenticated;


commit;
