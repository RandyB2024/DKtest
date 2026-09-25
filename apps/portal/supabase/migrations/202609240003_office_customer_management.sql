-- Office phase 2A. Additive only: existing RLS/write blocks remain intact.
begin;

-- Private helpers: callable only by the migration/function owner.
create function public.office_cm_actor() returns uuid
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not public.has_aal2() or not public.is_office_user() then
    raise exception using errcode='42501', message='Office write denied';
  end if;
  perform 1 from public.profiles p
    join public.office_memberships m on m.user_id=p.id
    join public.roles r on r.id=m.role_id
    where p.id=actor and p.account_status='active' and m.status='active'
      and r.scope='office' and r.code in ('owner','admin')
    for share of p,m,r;
  if not found then raise exception using errcode='42501', message='Office write denied'; end if;
  return actor;
end $$;

create function public.office_cm_id(value text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if value is null or value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023', message='Invalid input';
  end if;
  return value::uuid;
end $$;

create function public.office_cm_input(value jsonb, kind text, creating boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb := '{}'::jsonb; field text; val text; allowed text[];
begin
  allowed := case kind when 'relationship' then array['name','status'] when 'organization' then array['name','legal_name','registration_number'] else array[]::text[] end;
  if value is null or jsonb_typeof(value) <> 'object' then raise exception using errcode='22023',message='Invalid input'; end if;
  if kind <> 'archive' and value = '{}'::jsonb then raise exception using errcode='22023',message='Invalid input'; end if;
  if creating and not value ? 'name' then raise exception using errcode='22023',message='Invalid input'; end if;
  for field in select jsonb_object_keys(value) loop
    if not field = any(allowed) then raise exception using errcode='22023',message='Invalid input'; end if;
    if value->field = 'null'::jsonb and field in ('legal_name','registration_number') then
      result := result || jsonb_build_object(field,null); continue;
    end if;
    if jsonb_typeof(value->field) <> 'string' then raise exception using errcode='22023',message='Invalid input'; end if;
    val := regexp_replace(value->>field, '^\s+|\s+$', '', 'g');
    if length(val)>200 or (field='name' and length(val)=0) or (field='status' and val not in ('active','inactive'))
       or (field='registration_number' and val <> '' and val !~ '^[0-9]{8}$') then
      raise exception using errcode='22023',message='Invalid input';
    end if;
    result := result || jsonb_build_object(field,case when field in ('legal_name','registration_number') then nullif(val,'') else val end);
  end loop;
  return result;
end $$;

create function public.office_cm_audit(actor uuid, relationship uuid, organization uuid, action_name text, object_kind text, object uuid, fields jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events(actor_id,customer_relationship_id,organization_id,action,object_type,object_id,result,metadata)
    values(actor,relationship,organization,action_name,object_kind,object,'success',jsonb_build_object('changed_fields',fields));
end $$;

create function public.office_create_relationship(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor uuid; target uuid; rel public.customer_relationships%rowtype; org public.organizations%rowtype; input jsonb; org_input jsonb; changed jsonb; child record;
begin
  actor := public.office_cm_actor();
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception using errcode='22023',message='Invalid input'; end if;
  input := public.office_cm_input(p_input - 'organization','relationship',true);
  if p_input ? 'organization' then org_input := public.office_cm_input(p_input->'organization','organization',true); end if;
  insert into public.customer_relationships(name,status) values(input->>'name',coalesce(input->>'status','active')) returning * into rel;
  perform public.office_cm_audit(actor,rel.id,null,'relationship.created','customer_relationship',rel.id,(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(input) key));
  if org_input is not null then
    insert into public.organizations(customer_relationship_id,name,legal_name,registration_number)
      values(rel.id,org_input->>'name',org_input->>'legal_name',org_input->>'registration_number') returning * into org;
    perform public.office_cm_audit(actor,rel.id,org.id,'organization.created','organization',org.id,
      (select jsonb_agg(key order by key) from jsonb_object_keys(org_input) key));
  end if;
  return jsonb_build_object('relationship_id',rel.id,'organization_id',org.id);
end $$;

create function public.office_update_relationship(p_id text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor uuid; target uuid; rel public.customer_relationships%rowtype; org public.organizations%rowtype; input jsonb; org_input jsonb; changed jsonb; child record;
begin
  actor := public.office_cm_actor();
  target := public.office_cm_id(p_id);
  select * into rel from public.customer_relationships where id=target and archived_at is null for update;
  if not found then raise exception using errcode='P0002',message='Record unavailable'; end if;
  input := public.office_cm_input(p_input,'relationship',false);
  select coalesce(jsonb_agg(key order by key),'[]'::jsonb) into changed from jsonb_each(input) where value is distinct from to_jsonb(rel)->key;
  update public.customer_relationships set name=case when input ? 'name' then input->>'name' else name end,status=case when input ? 'status' then input->>'status' else status end where id=rel.id;
  perform public.office_cm_audit(actor,rel.id,null,'relationship.updated','customer_relationship',rel.id,changed);
  return jsonb_build_object('relationship_id',rel.id);
end $$;

create function public.office_create_organization(p_id text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor uuid; target uuid; rel public.customer_relationships%rowtype; org public.organizations%rowtype; input jsonb; org_input jsonb; changed jsonb; child record;
begin
  actor := public.office_cm_actor();
  target := public.office_cm_id(p_id);
  select * into rel from public.customer_relationships where id=target and archived_at is null for update;
  if not found then raise exception using errcode='P0002',message='Record unavailable'; end if;
  input := public.office_cm_input(p_input,'organization',true);
  insert into public.organizations(customer_relationship_id,name,legal_name,registration_number)
    values(rel.id,input->>'name',input->>'legal_name',input->>'registration_number') returning * into org;
  perform public.office_cm_audit(actor,rel.id,org.id,'organization.created','organization',org.id,(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(input) key));
  return jsonb_build_object('relationship_id',rel.id,'organization_id',org.id);
end $$;

create function public.office_update_organization(p_id text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor uuid; target uuid; rel public.customer_relationships%rowtype; org public.organizations%rowtype; input jsonb; org_input jsonb; changed jsonb; child record;
begin
  actor := public.office_cm_actor();
  target := public.office_cm_id(p_id);
  -- Lock parent before child, consistently with create and relationship archive.
  select * into rel from public.customer_relationships where id=(select customer_relationship_id from public.organizations where id=target) and archived_at is null for update;
  if not found then raise exception using errcode='P0002',message='Record unavailable'; end if;
  select * into org from public.organizations where id=target and customer_relationship_id=rel.id and archived_at is null for update;
  if not found then raise exception using errcode='P0002',message='Record unavailable'; end if;
  input := public.office_cm_input(p_input,'organization',false);
  select coalesce(jsonb_agg(key order by key),'[]'::jsonb) into changed from jsonb_each(input) where value is distinct from to_jsonb(org)->key;
  update public.organizations set name=case when input ? 'name' then input->>'name' else name end,
    legal_name=case when input ? 'legal_name' then input->>'legal_name' else legal_name end,
    registration_number=case when input ? 'registration_number' then input->>'registration_number' else registration_number end where id=org.id;
  perform public.office_cm_audit(actor,rel.id,org.id,'organization.updated','organization',org.id,changed);
  return jsonb_build_object('relationship_id',rel.id,'organization_id',org.id);
end $$;

create function public.office_archive_organization(p_id text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor uuid; target uuid; rel public.customer_relationships%rowtype; org public.organizations%rowtype; input jsonb; org_input jsonb; changed jsonb; child record;
begin
  actor := public.office_cm_actor();
  target := public.office_cm_id(p_id);
  -- Lock parent before child, consistently with create and relationship archive.
  select * into rel from public.customer_relationships where id=(select customer_relationship_id from public.organizations where id=target) and archived_at is null for update;
  if not found then raise exception using errcode='P0002',message='Record unavailable'; end if;
  select * into org from public.organizations where id=target and customer_relationship_id=rel.id and archived_at is null for update;
  if not found then raise exception using errcode='P0002',message='Record unavailable'; end if;
  input := public.office_cm_input(p_input,'archive',false);
  update public.organizations set archived_at=now() where id=org.id;
  perform public.office_cm_audit(actor,rel.id,org.id,'organization.archived','organization',org.id,'["archived_at"]'::jsonb);
  return jsonb_build_object('relationship_id',rel.id,'organization_id',org.id);
end $$;

create function public.office_archive_relationship(p_id text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor uuid; target uuid; rel public.customer_relationships%rowtype; org public.organizations%rowtype; input jsonb; org_input jsonb; changed jsonb; child record;
begin
  actor := public.office_cm_actor();
  target := public.office_cm_id(p_id);
  select * into rel from public.customer_relationships where id=target and archived_at is null for update;
  if not found then raise exception using errcode='P0002',message='Record unavailable'; end if;
  input := public.office_cm_input(p_input,'archive',false);
  for child in select id from public.organizations where customer_relationship_id=rel.id and archived_at is null order by id for update loop
    update public.organizations set archived_at=now() where id=child.id;
    perform public.office_cm_audit(actor,rel.id,child.id,'organization.archived','organization',child.id,'["archived_at"]'::jsonb);
  end loop;
  update public.customer_relationships set archived_at=now() where id=rel.id;
  perform public.office_cm_audit(actor,rel.id,null,'relationship.archived','customer_relationship',rel.id,'["archived_at"]'::jsonb);
  return jsonb_build_object('relationship_id',rel.id);
end $$;

revoke all on function public.office_cm_actor() from public,anon,authenticated;
revoke all on function public.office_cm_id(text) from public,anon,authenticated;
revoke all on function public.office_cm_input(jsonb,text,boolean) from public,anon,authenticated;
revoke all on function public.office_cm_audit(uuid,uuid,uuid,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.office_create_relationship(jsonb) from public,anon;
grant execute on function public.office_create_relationship(jsonb) to authenticated;
revoke all on function public.office_update_relationship(text,jsonb) from public,anon;
grant execute on function public.office_update_relationship(text,jsonb) to authenticated;
revoke all on function public.office_create_organization(text,jsonb) from public,anon;
grant execute on function public.office_create_organization(text,jsonb) to authenticated;
revoke all on function public.office_update_organization(text,jsonb) from public,anon;
grant execute on function public.office_update_organization(text,jsonb) to authenticated;
revoke all on function public.office_archive_organization(text,jsonb) from public,anon;
grant execute on function public.office_archive_organization(text,jsonb) to authenticated;
revoke all on function public.office_archive_relationship(text,jsonb) from public,anon;
grant execute on function public.office_archive_relationship(text,jsonb) to authenticated;
commit;
