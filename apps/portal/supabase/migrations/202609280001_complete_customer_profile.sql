-- Additive Office customer profile. Existing applied migrations remain unchanged.
begin;
alter table public.customer_relationships add column profile_version bigint not null default 0,
  add column relationship_number bigint generated always as identity unique,
  add column responsible_id uuid references public.profiles(id), add column started_on date;
-- Keep internal edit counters out of organizations, which portal users can read.
create table public.office_customer_versions(organization_id uuid primary key references public.organizations(id),version bigint not null default 0);
alter table public.office_customer_versions enable row level security;
revoke all on public.office_customer_versions from public,anon,authenticated;

create function public.office_cp_schema() returns jsonb language sql immutable set search_path=public as $$
 select '{"overview":{"label":"Overzicht","fields":{"name":{"label":"Klantnaam","type":"text","max":200,"required":true},"status":{"label":"Klantstatus","type":"enum","values":["active","inactive"]},"responsible_id":{"label":"Verantwoordelijke medewerker","type":"staff"},"started_on":{"label":"Start klantrelatie","type":"date"}}},"company":{"label":"Onderneming","fields":{"name":{"label":"Handelsnaam","type":"text","max":200,"required":true},"legal_name":{"label":"Officiële naam","type":"text","max":200},"trade_names":{"label":"Overige handelsnamen","type":"text","max":1000},"rsin":{"label":"RSIN (tekst, indien van toepassing)","type":"text","max":40},"legal_form":{"label":"Rechtsvorm","type":"text","max":200},"business_status":{"label":"Ondernemingsstatus","type":"enum","values":["active","inactive"]},"visit_address":{"label":"Bezoekadres","type":"text","max":1000},"postal_address":{"label":"Postadres","type":"text","max":1000},"phone":{"label":"Telefoon","type":"text","max":80},"email":{"label":"Algemeen e-mailadres","type":"email","max":254},"website":{"label":"Website","type":"url","max":500},"started_on":{"label":"Start onderneming","type":"date"},"ended_on":{"label":"Einde onderneming","type":"date"},"activities":{"label":"Bedrijfsactiviteiten","type":"text","max":2000}}},"contacts":{"label":"Contactpersonen","collection":true,"fields":{"first_name":{"label":"Voornaam","type":"text","max":200},"infix":{"label":"Tussenvoegsel","type":"text","max":80},"last_name":{"label":"Achternaam","type":"text","max":200,"required":true},"preferred_name":{"label":"Aanspreeknaam","type":"text","max":200},"job_title":{"label":"Functie","type":"text","max":200},"email":{"label":"E-mailadres","type":"email","max":254},"phone":{"label":"Telefoon","type":"text","max":80},"mobile":{"label":"Mobiel","type":"text","max":80},"preferred_contact":{"label":"Voorkeurscontact","type":"enum","values":["email","phone","mobile","post"]},"is_primary":{"label":"Primaire contactpersoon","type":"boolean"},"can_sign":{"label":"Tekenbevoegd","type":"boolean"},"portal_access":{"label":"Portaaltoegang geregistreerd (maakt geen account)","type":"boolean"},"active":{"label":"Actief","type":"boolean"},"internal_comment":{"label":"Interne opmerking","type":"text","max":2000}}},"fiscal":{"label":"Fiscaal","sensitive":true,"fields":{"vat_id":{"label":"Btw-identificatienummer","type":"text","max":40},"tax_number":{"label":"Omzetbelastingnummer","type":"text","max":40},"vat_liable":{"label":"Omzetbelastingplichtig","type":"boolean"},"vat_period":{"label":"Btw-aangifteperiode","type":"enum","values":["month","quarter","year","not_applicable"]},"filing_start":{"label":"Aanvang aangiftetijdvak","type":"date"},"fiscal_form":{"label":"Fiscale ondernemingsvorm","type":"text","max":200},"income_tax":{"label":"Winstbelasting","type":"enum","values":["income_tax","corporate_tax","not_applicable"]},"payroll_number":{"label":"Loonheffingsnummer","type":"text","max":40},"payroll_period":{"label":"Loonheffingenaangifteperiode","type":"enum","values":["month","four_weeks","not_applicable"]},"fiscal_unity":{"label":"Fiscale eenheid","type":"boolean"},"kor":{"label":"KOR","type":"boolean"},"icp":{"label":"ICP","type":"boolean"},"oss":{"label":"OSS","type":"boolean"},"year_start":{"label":"Boekjaar begin","type":"date"},"year_end":{"label":"Boekjaar einde","type":"date"},"broken_year":{"label":"Gebroken boekjaar","type":"boolean"},"external_adviser":{"label":"Externe belastingadviseur","type":"text","max":200},"attention":{"label":"Fiscale aandachtspunten","type":"text","max":4000}}},"administration":{"label":"Administratie","private":true,"fields":{"status":{"label":"Administratiestatus","type":"enum","values":["setup","active","blocked","ended"]},"started_on":{"label":"Administratiestart","type":"date"},"first_period":{"label":"Eerste te verwerken periode","type":"text","max":80},"financial_year":{"label":"Boekjaar","type":"integer","max":9999},"reporting_frequency":{"label":"Rapportagefrequentie","type":"enum","values":["month","quarter","half_year","year","on_request"]},"currency":{"label":"Valuta (ISO-code)","type":"currency","max":3},"accounting_method":{"label":"Stelsel","type":"enum","values":["invoice","cash"]},"external_package":{"label":"Extern boekhoudpakket","type":"text","max":200},"migration_source":{"label":"Migratiebron","type":"text","max":200},"cost_centers":{"label":"Kostenplaatsen gewenst","type":"boolean"},"projects":{"label":"Projecten gewenst","type":"boolean"},"payroll":{"label":"Salarisadministratie","type":"boolean"},"employees":{"label":"Aantal werknemers","type":"integer","max":10000000},"setup_notes":{"label":"Inrichting en aandachtspunten","type":"text","max":4000}}},"banks":{"label":"Bankrekeningen","private":true,"collection":true,"fields":{"label":{"label":"Omschrijving","type":"text","max":200},"iban":{"label":"IBAN","type":"iban","max":34,"required":true}}},"services":{"label":"Diensten","private":true,"collection":true,"fields":{"service":{"label":"Dienst","type":"enum","values":["administration","vat","income_tax","corporate_tax","annual_accounts","payroll","reporting","guidance","meeting","other"]},"status":{"label":"Status","type":"enum","values":["active","ended"]},"started_on":{"label":"Startdatum","type":"date"},"ended_on":{"label":"Einddatum","type":"date"},"frequency":{"label":"Frequentie","type":"text","max":120},"responsible_id":{"label":"Verantwoordelijke medewerker","type":"staff"},"price_agreement":{"label":"Prijsafspraak (tekst)","type":"text","max":1000},"description":{"label":"Interne beschrijving","type":"text","max":2000}}},"agreements":{"label":"Afspraken","private":true,"fields":{"contact_frequency":{"label":"Contactfrequentie","type":"text","max":120},"meetings_per_year":{"label":"Gesprekken per jaar","type":"integer","max":366},"preferred_times":{"label":"Voorkeursdagen of dagdelen","type":"text","max":1000},"reporting":{"label":"Rapportageafspraken","type":"text","max":2000},"submission_deadline":{"label":"Aanleverdeadline","type":"text","max":500},"particulars":{"label":"Bijzonderheden","type":"text","max":2000}}},"notes":{"label":"Interne notities","private":true,"collection":true,"fields":{"title":{"label":"Titel","type":"text","max":200,"required":true},"body":{"label":"Inhoud","type":"text","max":6000,"required":true},"category":{"label":"Categorie","type":"text","max":80},"pinned":{"label":"Vastgepind","type":"boolean"}}}}'::jsonb
$$;
revoke all on function public.office_cp_schema() from public,anon,authenticated;

create function public.office_cp_role() returns text language sql stable security definer set search_path=public as $$
 select r.code from profiles p join office_memberships m on m.user_id=p.id join roles r on r.id=m.role_id
 where p.id=auth.uid() and p.account_status='active' and m.status='active' and r.scope='office'
 and public.has_aal2() and public.is_office_user()
$$;
revoke all on function public.office_cp_role() from public,anon;
grant execute on function public.office_cp_role() to authenticated;

-- Only these explicit roles may read a section. Unknown/new role codes fail closed.
create function public.office_cp_can_read(section text) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.office_cp_role() in ('owner','admin') or
 (section in ('overview','company','contacts') and public.office_cp_role() in ('accountant','handler','viewer')) or
 (section='fiscal' and public.office_cp_role()='accountant'),false)
$$;
revoke all on function public.office_cp_can_read(text) from public,anon;
grant execute on function public.office_cp_can_read(text) to authenticated;

-- Typed normalized tables, with a closed field contract used by the RPC too.
do $$ declare section text; spec jsonb; field text; rule jsonb; cols text; typ text; begin
 for section,spec in select * from jsonb_each(public.office_cp_schema()) loop
  if section='overview' then continue; end if;
  cols:='';
  for field,rule in select * from jsonb_each(spec->'fields') loop
   if section='company' and field in ('name','legal_name') then continue; end if;
   typ:=case rule->>'type' when 'boolean' then 'boolean' when 'integer' then 'integer' when 'date' then 'date' when 'staff' then 'uuid references public.profiles(id)' else 'text' end;
   cols:=cols||format(', %I %s',field,typ);
  end loop;
  execute format('create table public.%I (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz %s %s)',
   'office_customer_'||section,cols,case when coalesce((spec->>'collection')::boolean,false) then '' else ', unique(organization_id)' end);
  execute format('alter table public.%I enable row level security','office_customer_'||section);
  execute format('revoke all on public.%I from public,anon,authenticated','office_customer_'||section);
  -- Raw contacts contain an internal comment; non-admin reads use the redacting RPC.
  execute format('grant select on public.%I to authenticated','office_customer_'||section);
  execute format('create index on public.%I (organization_id,created_at desc,id desc)','office_customer_'||section);
  execute format('create policy profile_read on public.%I for select to authenticated using (public.office_cp_can_read(%L) and exists(select 1 from public.organizations o join public.customer_relationships r on r.id=o.customer_relationship_id where o.id=organization_id and o.archived_at is null and r.archived_at is null))','office_customer_'||section,case when section='contacts' then 'private' when section='company' then 'fiscal' else section end);
 end loop;
end $$;
create unique index office_one_primary_contact on public.office_customer_contacts(organization_id) where archived_at is null and active is true and is_primary is true;
alter table public.office_customer_contacts add constraint contact_last_name check(nullif(btrim(last_name),'') is not null);
alter table public.office_customer_notes add constraint note_title_body check(nullif(btrim(title),'') is not null and nullif(btrim(body),'') is not null);
alter table public.office_customer_banks add constraint bank_iban_required check(iban is not null);
alter table public.office_customer_administration alter column currency set default 'EUR';
create table public.office_customer_note_revisions (
 id uuid primary key default gen_random_uuid(), note_id uuid not null references public.office_customer_notes(id),
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), content jsonb not null
);
alter table public.office_customer_note_revisions enable row level security;
create index on public.office_customer_note_revisions(note_id,created_at desc,id desc);
revoke all on public.office_customer_note_revisions from public,anon,authenticated;
grant select on public.office_customer_note_revisions to authenticated;
create policy note_revision_read on public.office_customer_note_revisions for select to authenticated using(public.office_cp_can_read('notes') and exists(select 1 from public.organizations o where o.id=organization_id and o.archived_at is null));
-- Historical intake manual_details and audit are internal. Extra restrictions only.
create policy intake_sensitive_boundary on public.organization_kvk_intakes as restrictive for select to authenticated using(public.office_cp_can_read('private'));
create policy audit_profile_boundary on public.audit_events as restrictive for select to authenticated using(public.office_cp_can_read('private'));

-- Legacy updates also invalidate profile versions. KvK correction is not enabled.
create function public.office_cp_base_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='organizations' then
  if new.registration_number is distinct from old.registration_number then
   raise exception using errcode='22023',message='Registration number is read only';
  end if;
  insert into public.office_customer_versions(organization_id,version) values(new.id,1)
    on conflict(organization_id) do update set version=office_customer_versions.version+1;
 else
  new.profile_version:=old.profile_version+1;
 end if;
 return new;
end $$;
revoke all on function public.office_cp_base_guard() from public,anon,authenticated;
create trigger office_cp_org_version before update on public.organizations for each row execute function public.office_cp_base_guard();
create trigger office_cp_rel_version before update on public.customer_relationships for each row execute function public.office_cp_base_guard();

create function public.office_cp_iban(value text) returns boolean language plpgsql immutable set search_path=public as $$
declare s text:=upper(regexp_replace(value,'\s','','g')); c text; digits text; remainder integer:=0; i integer;j integer;
begin
 if s is null or s !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' or (left(s,2)='NL' and s !~ '^NL[0-9]{2}[A-Z]{4}[0-9]{10}$') then return false; end if;
 s:=substr(s,5)||left(s,4);
 for i in 1..length(s) loop c:=substr(s,i,1);digits:=case when c ~ '[A-Z]' then (ascii(c)-55)::text else c end;
  for j in 1..length(digits) loop remainder:=(remainder*10+substr(digits,j,1)::integer)%97;end loop;
 end loop;return remainder=1;
end $$;
revoke all on function public.office_cp_iban(text) from public,anon,authenticated;

create function public.office_cp_input(section text,input jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare schema jsonb:=public.office_cp_schema()->section->'fields'; field text; value jsonb; rule jsonb; s text; result jsonb:='{}'; d date;
begin
 if schema is null or input is null or jsonb_typeof(input)<>'object' or input='{}' or octet_length(input::text)>16000 then raise exception using errcode='22023',message='Invalid fields';end if;
 for field,value in select * from jsonb_each(input) loop
  rule:=schema->field;if rule is null then raise exception using errcode='22023',message='Invalid field';end if;
  if value='null' then
   if coalesce((rule->>'required')::boolean,false) then raise exception using errcode='22023',message='Required field';end if;
   result:=result||jsonb_build_object(field,null);continue;
  end if;
  s:=btrim(value#>>'{}');
  if rule->>'type'='boolean' then
   if jsonb_typeof(value)<>'boolean' then raise exception using errcode='22023',message='Invalid boolean';end if;
  elsif rule->>'type'='integer' then
   if jsonb_typeof(value)<>'number' or s !~ '^[0-9]+$' or s::numeric>(rule->>'max')::integer then raise exception using errcode='22023',message='Invalid count';end if;
  else
   if jsonb_typeof(value)<>'string' or length(s)>coalesce((rule->>'max')::integer,200) or s ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' then raise exception using errcode='22023',message='Invalid text';end if;
   if s='' then if coalesce((rule->>'required')::boolean,false) then raise exception using errcode='22023',message='Required field';end if;value:='null';
   else
    case rule->>'type'
     when 'email' then s:=lower(s);if s !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='22023',message='Invalid email';end if;
     when 'enum' then if not (rule->'values') ? s then raise exception using errcode='22023',message='Invalid choice';end if;
     when 'date' then if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='22023',message='Invalid date';end if;d:=s::date;
     when 'staff' then perform 1 from profiles p join office_memberships m on m.user_id=p.id join roles r on r.id=m.role_id where p.id=public.office_cm_id(s) and p.account_status='active' and m.status='active' and r.scope='office';if not found then raise exception using errcode='22023',message='Invalid staff';end if;
     when 'currency' then s:=upper(s);if s !~ '^[A-Z]{3}$' then raise exception using errcode='22023',message='Invalid currency';end if;
     when 'url' then if s !~ '^https?://[^/@[:space:]]+([/:?#][^[:space:]]*)?$' then raise exception using errcode='22023',message='Invalid website';end if;
     when 'iban' then s:=upper(regexp_replace(s,'\s','','g'));if not public.office_cp_iban(s) then raise exception using errcode='22023',message='Invalid IBAN';end if;
     else null;
    end case;value:=to_jsonb(s);
   end if;
  end if;result:=result||jsonb_build_object(field,value);
 end loop;return result;
exception when invalid_datetime_format or datetime_field_overflow then raise exception using errcode='22023',message='Invalid date';
end $$;
revoke all on function public.office_cp_input(text,jsonb) from public,anon,authenticated;

create function public.office_customer_profile_write(p_relationship_id text,p_organization_id text,p_section text,p_input jsonb,p_version bigint,p_record_id text default null,p_archive boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid; rid uuid; oid uuid; target uuid; rel customer_relationships%rowtype; org organizations%rowtype; input jsonb; previous jsonb; merged jsonb; table_name text; assignments text; columns_sql text; values_sql text; field text; schema jsonb; changed jsonb; record_id uuid; result_version bigint; org_version bigint;
begin
 actor:=public.office_cm_actor();rid:=public.office_cm_id(p_relationship_id);oid:=public.office_cm_id(p_organization_id);
 select * into rel from customer_relationships where id=rid and archived_at is null for update;
 if not found then raise exception using errcode='P0002',message='Unavailable';end if;
 select * into org from organizations where id=oid and customer_relationship_id=rid and archived_at is null for update;
 if not found then raise exception using errcode='P0002',message='Unavailable';end if;
 schema:=public.office_cp_schema()->p_section;
 if schema is null or p_archive is null then raise exception using errcode='22023',message='Invalid section';end if;
 select coalesce((select version from office_customer_versions where organization_id=oid),0) into org_version;
 if p_version is null or p_version<>(case when p_section='overview' then rel.profile_version else org_version end) then raise exception using errcode='40001',message='Version conflict';end if;
 if p_record_id is not null then target:=public.office_cm_id(p_record_id);end if;
 if p_archive then
  if not coalesce((schema->>'collection')::boolean,false) or target is null or p_input is distinct from '{}'::jsonb then raise exception using errcode='22023',message='Invalid archive';end if;input:='{}';
 else input:=public.office_cp_input(p_section,p_input);end if;
 if not coalesce((schema->>'collection')::boolean,false) and target is not null then raise exception using errcode='22023',message='Invalid record';end if;
 if p_section='overview' then
  previous:=to_jsonb(rel);merged:=previous||input;
  if merged->>'status' is null then raise exception using errcode='22023',message='Required status';end if;
  update customer_relationships set name=merged->>'name',status=merged->>'status',responsible_id=(merged->>'responsible_id')::uuid,started_on=(merged->>'started_on')::date where id=rid returning profile_version into result_version;record_id:=rid;
 else
  table_name:='office_customer_'||p_section;
  if coalesce((schema->>'collection')::boolean,false) then
   if target is not null then execute format('select to_jsonb(t) from public.%I t where id=$1 and organization_id=$2 and archived_at is null for update',table_name) into previous using target,oid;
    if previous is null then raise exception using errcode='P0002',message='Unavailable';end if;
   end if;
  else execute format('select to_jsonb(t) from public.%I t where organization_id=$1 for update',table_name) into previous using oid;
  end if;
  if p_section='company' then previous:=coalesce(previous,'{}')||jsonb_build_object('name',org.name,'legal_name',org.legal_name);end if;
  merged:=coalesce(previous,'{}')||input;
  if (merged->>'ended_on')::date < (merged->>'started_on')::date or (merged->>'year_end')::date < (merged->>'year_start')::date then raise exception using errcode='22023',message='Invalid date range';end if;
  if p_section='contacts' and merged->>'is_primary'='true' and merged->>'active' is distinct from 'true' and not p_archive then raise exception using errcode='22023',message='Primary must be active';end if;
  if not p_archive then
   for field in select key from jsonb_each(schema->'fields') where value->>'required'='true' loop
    if nullif(merged->>field,'') is null then raise exception using errcode='22023',message='Required field';end if;
   end loop;
   if p_section='services' and (merged->>'service' is null or merged->>'status' is null) then raise exception using errcode='22023',message='Required service';end if;
  end if;
  record_id:=coalesce(target,(previous->>'id')::uuid,gen_random_uuid());
  if p_archive then execute format('update public.%I set archived_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=$2 where id=$1',table_name) using record_id,actor;
  else
   if p_section='company' then
    update organizations set name=merged->>'name',legal_name=merged->>'legal_name' where id=oid;
    input:=input-'name'-'legal_name';
   end if;
   columns_sql:='';values_sql:='';assignments:='';
   for field in select jsonb_object_keys(input) loop
    columns_sql:=columns_sql||format(',%I',field);values_sql:=values_sql||format(',r.%I',field);assignments:=assignments||format('%I=r.%I,',field,field);
   end loop;
   if previous->>'id' is null then
    execute format('insert into public.%I(id,organization_id,created_by,updated_by%s) select $1,$2,$3,$3%s from jsonb_populate_record(null::public.%I,$4) r',table_name,columns_sql,values_sql,table_name) using record_id,oid,actor,input;
   else
    execute format('update public.%I t set %s updated_at=clock_timestamp(),updated_by=$2 from jsonb_populate_record(null::public.%I,$3) r where t.id=$1',table_name,assignments,table_name) using record_id,actor,input;
   end if;
  end if;
  if p_section='notes' then
   execute 'select to_jsonb(n)-''created_by''-''updated_by''-''organization_id'' from public.office_customer_notes n where id=$1' into merged using record_id;
   insert into office_customer_note_revisions(note_id,organization_id,actor_id,content) values(record_id,oid,actor,merged);
  end if;
  update organizations set name=name where id=oid;
  select version into result_version from office_customer_versions where organization_id=oid;
 end if;
 select coalesce(jsonb_agg(key order by key),'[]') into changed from jsonb_each(p_input) where value is distinct from coalesce(previous,'{}')->key;
 if p_archive then changed:='["archived_at"]';end if;
 perform public.office_cm_audit(actor,rid,oid,'profile.'||p_section||case when p_archive then '.archived' else '.saved' end,p_section,record_id,changed);
 return jsonb_build_object('id',record_id,'version',result_version);
end $$;
revoke all on function public.office_customer_profile_write(text,text,text,jsonb,bigint,text,boolean) from public,anon;
grant execute on function public.office_customer_profile_write(text,text,text,jsonb,bigint,text,boolean) to authenticated;

create function public.office_customer_profile_read(p_relationship_id text,p_organization_id text,p_section text default null,p_page integer default 1,p_archived boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rid uuid;oid uuid;rel customer_relationships%rowtype;org organizations%rowtype;result jsonb;spec jsonb;section text;data jsonb;row_data jsonb; items jsonb:='[]';staff jsonb;source jsonb;history jsonb;org_version bigint;
begin
 if not public.office_cp_can_read('overview') then raise exception using errcode='42501',message='Read denied';end if;
 rid:=public.office_cm_id(p_relationship_id);oid:=public.office_cm_id(p_organization_id);
 select * into rel from customer_relationships where id=rid and archived_at is null;
 select * into org from organizations where id=oid and customer_relationship_id=rid and archived_at is null;
 if rel.id is null or org.id is null then raise exception using errcode='P0002',message='Unavailable';end if;
 select coalesce((select version from office_customer_versions where organization_id=oid),0) into org_version;
 if p_page is null or p_page<1 or p_page>10000 or p_archived is null then raise exception using errcode='22023',message='Invalid page';end if;
 if p_section is not null then
  if not public.office_cp_can_read(p_section) then raise exception using errcode='42501',message='Read denied';end if;
  if p_section='history' then
   select coalesce(jsonb_agg(x),'[]') into items from (select a.id,a.actor_id,p.display_name as actor,a.object_type,a.object_id,a.action,a.result,a.created_at,
     jsonb_build_object('changed_fields',case when jsonb_typeof(a.metadata->'changed_fields')='array' then a.metadata->'changed_fields' else '[]'::jsonb end) as metadata
     from audit_events a left join profiles p on p.id=a.actor_id where a.customer_relationship_id=rid and (a.organization_id=oid or a.organization_id is null) order by a.created_at desc,a.id desc limit 25 offset (p_page-1)*25) x;
  else
   spec:=public.office_cp_schema()->p_section;
   if not coalesce((spec->>'collection')::boolean,false) then raise exception using errcode='22023',message='Invalid collection';end if;
   for row_data in execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and (archived_at is not null)=$2 order by created_at desc,id desc limit 25 offset $3','office_customer_'||p_section) using oid,p_archived,(p_page-1)*25 loop
    if p_section='banks' then row_data:=row_data||jsonb_build_object('iban',left(row_data->>'iban',2)||' •••• '||right(row_data->>'iban',4));end if;
    if p_section='contacts' and not public.office_cp_can_read('private') then row_data:=row_data-'internal_comment';end if;
    items:=items||jsonb_build_array(row_data);
   end loop;
  end if;
  return jsonb_build_object('items',items,'page',p_page,'hasMore',jsonb_array_length(items)=25,'version',org_version);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name),'[]') into staff from profiles p join office_memberships m on m.user_id=p.id join roles r on r.id=m.role_id where p.account_status='active' and m.status='active' and r.scope='office';
 select jsonb_build_object('profile',k.profile,'checked_at',k.kvk_checked_at,'environment',k.kvk_environment) into source from organization_kvk_intakes k where k.organization_id=oid;
 result:=jsonb_build_object('relationship',to_jsonb(rel),'organization',to_jsonb(org)||jsonb_build_object('profile_version',org_version),'staff',staff,'source',source,'sections','{}'::jsonb,'canWrite',public.office_cp_role() in ('owner','admin'));
 for section,spec in select * from jsonb_each(public.office_cp_schema()) loop
  if section='overview' or coalesce((spec->>'collection')::boolean,false) or not public.office_cp_can_read(section) then continue;end if;
  execute format('select to_jsonb(t) from public.%I t where organization_id=$1','office_customer_'||section) into data using oid;
  if section='company' and not public.office_cp_can_read('fiscal') then data:=data-'rsin';end if;
  result:=jsonb_set(result,array['sections',section],coalesce(data,'{}'));
 end loop;
 -- Old intake manual fields stay historical; only privileged users can review them.
 if public.office_cp_can_read('private') then select manual_details into data from organization_kvk_intakes where organization_id=oid;result:=result||jsonb_build_object('legacyManual',data);end if;
 return result||jsonb_build_object('role',public.office_cp_role());
end $$;
revoke all on function public.office_customer_profile_read(text,text,text,integer,boolean) from public,anon;
grant execute on function public.office_customer_profile_read(text,text,text,integer,boolean) to authenticated;
commit;
