-- Additive intake; applied migrations are immutable.
begin;
create or replace function public.office_cp_schema() returns jsonb language sql immutable set search_path=public as $$ select '{"overview":{"label":"Overzicht","fields":{"name":{"label":"Klantnaam","type":"text","max":200,"required":true},"status":{"label":"Klantstatus","type":"enum","values":["active","inactive"]},"responsible_id":{"label":"Verantwoordelijke medewerker","type":"staff"},"started_on":{"label":"Start klantrelatie","type":"date"}}},"company":{"label":"Onderneming","fields":{"name":{"label":"Handelsnaam","type":"text","max":200,"required":true},"legal_name":{"label":"Officiële naam","type":"text","max":200},"trade_names":{"label":"Overige handelsnamen","type":"text","max":1000},"rsin":{"label":"RSIN (tekst, indien van toepassing)","type":"text","max":40},"legal_form":{"label":"Rechtsvorm","type":"text","max":200},"business_status":{"label":"Ondernemingsstatus","type":"enum","values":["active","inactive"]},"visit_address":{"label":"Bezoekadres","type":"text","max":1000},"postal_address":{"label":"Postadres","type":"text","max":1000},"phone":{"label":"Telefoon","type":"text","max":80},"email":{"label":"Algemeen e-mailadres","type":"email","max":254},"website":{"label":"Website","type":"url","max":500},"started_on":{"label":"Start onderneming","type":"date"},"ended_on":{"label":"Einde onderneming","type":"date"},"activities":{"label":"Bedrijfsactiviteiten","type":"text","max":2000},"postal_same":{"label":"Postadres gelijk aan bezoekadres","type":"boolean"},"visit_country":{"label":"Bezoekadres · landcode","type":"text","max":2},"visit_postcode":{"label":"Bezoekadres · postcode","type":"text","max":20},"visit_house_number":{"label":"Bezoekadres · huisnummer","type":"text","max":20},"visit_addition":{"label":"Bezoekadres · toevoeging","type":"text","max":20},"visit_street":{"label":"Bezoekadres · straat","type":"text","max":200},"visit_city":{"label":"Bezoekadres · woonplaats","type":"text","max":200},"visit_municipality":{"label":"Bezoekadres · gemeente","type":"text","max":200},"visit_bag_id":{"label":"Bezoekadres · BAG-identificatie","type":"text","max":16},"postal_country":{"label":"Postadres · landcode","type":"text","max":2},"postal_postcode":{"label":"Postadres · postcode","type":"text","max":20},"postal_house_number":{"label":"Postadres · huisnummer","type":"text","max":20},"postal_addition":{"label":"Postadres · toevoeging","type":"text","max":20},"postal_street":{"label":"Postadres · straat","type":"text","max":200},"postal_city":{"label":"Postadres · woonplaats","type":"text","max":200},"postal_municipality":{"label":"Postadres · gemeente","type":"text","max":200},"postal_bag_id":{"label":"Postadres · BAG-identificatie","type":"text","max":16},"visit_source":{"label":"Bezoekadres · bron (Office-opgave)","type":"enum","values":["manual","pdok_suggestion"]},"visit_manual":{"label":"Bezoekadres · handmatig aangepast","type":"boolean"},"postal_source":{"label":"Postadres · bron (Office-opgave)","type":"enum","values":["manual","pdok_suggestion"]},"postal_manual":{"label":"Postadres · handmatig aangepast","type":"boolean"}}},"contacts":{"label":"Contactpersonen","collection":true,"fields":{"first_name":{"label":"Voornaam","type":"text","max":200},"infix":{"label":"Tussenvoegsel","type":"text","max":80},"last_name":{"label":"Achternaam","type":"text","max":200,"required":true},"preferred_name":{"label":"Aanspreeknaam","type":"text","max":200},"job_title":{"label":"Functie","type":"text","max":200},"email":{"label":"E-mailadres","type":"email","max":254},"phone":{"label":"Telefoon","type":"text","max":80},"mobile":{"label":"Mobiel","type":"text","max":80},"preferred_contact":{"label":"Voorkeurscontact","type":"enum","values":["email","phone","mobile","post"]},"is_primary":{"label":"Primaire contactpersoon","type":"boolean"},"can_sign":{"label":"Tekenbevoegd","type":"boolean"},"portal_access":{"label":"Portaaltoegang geregistreerd (maakt geen account)","type":"boolean"},"active":{"label":"Actief","type":"boolean"},"internal_comment":{"label":"Interne opmerking","type":"text","max":2000}}},"fiscal":{"label":"Fiscaal","sensitive":true,"fields":{"vat_id":{"label":"Btw-identificatienummer","type":"text","max":40},"tax_number":{"label":"Omzetbelastingnummer","type":"text","max":40},"vat_liable":{"label":"Omzetbelastingplichtig","type":"boolean"},"vat_period":{"label":"Btw-aangifteperiode","type":"enum","values":["month","quarter","year","not_applicable","unknown"]},"filing_start":{"label":"Aanvang aangiftetijdvak","type":"date"},"fiscal_form":{"label":"Fiscale ondernemingsvorm","type":"text","max":200},"income_tax":{"label":"Winstbelasting","type":"enum","values":["income_tax","corporate_tax","not_applicable","unknown"]},"payroll_number":{"label":"Loonheffingsnummer","type":"text","max":40},"payroll_period":{"label":"Loonheffingenaangifteperiode","type":"enum","values":["month","four_weeks","not_applicable"]},"fiscal_unity":{"label":"Historisch: fiscale eenheid (btw/VPB niet gespecificeerd)","type":"boolean"},"kor":{"label":"KOR","type":"boolean"},"icp":{"label":"ICP","type":"boolean"},"oss":{"label":"OSS","type":"boolean"},"year_start":{"label":"Boekjaar begin","type":"date"},"year_end":{"label":"Boekjaar einde","type":"date"},"broken_year":{"label":"Gebroken boekjaar","type":"boolean"},"external_adviser":{"label":"Externe belastingadviseur","type":"text","max":200},"attention":{"label":"Fiscale aandachtspunten","type":"text","max":4000},"income_tax_start":{"label":"Ingang winstbelasting","type":"date"},"income_tax_confirm":{"label":"Winstbelasting expliciet beoordeeld en bevestigd","type":"boolean"},"vat_status":{"label":"Omzetbelastingstatus","type":"enum","values":["regular","kor","exempt","mixed","not_liable","unknown"]},"vat_status_start":{"label":"Ingang btw-status","type":"date"},"vat_unity":{"label":"Fiscale eenheid btw","type":"boolean"},"vpb_unity":{"label":"Fiscale eenheid VPB","type":"boolean"},"payroll_obligation":{"label":"Loonheffingen van toepassing","type":"boolean"},"dividend_tax":{"label":"Dividendbelasting van toepassing","type":"boolean"},"other_obligations":{"label":"Overige fiscale verplichting","type":"text","max":1000},"tax_responsible_id":{"label":"Verantwoordelijke fiscale intake","type":"staff"}}},"administration":{"label":"Administratie","private":true,"fields":{"status":{"label":"Administratiestatus","type":"enum","values":["setup","active","blocked","ended"]},"started_on":{"label":"Administratiestart","type":"date"},"first_period":{"label":"Eerste te verwerken periode","type":"text","max":80},"financial_year":{"label":"Boekjaar","type":"integer","max":9999},"reporting_frequency":{"label":"Rapportagefrequentie","type":"enum","values":["month","quarter","half_year","year","on_request"]},"currency":{"label":"Valuta (ISO-code)","type":"currency","max":3},"accounting_method":{"label":"Stelsel","type":"enum","values":["invoice","cash"]},"external_package":{"label":"Extern boekhoudpakket","type":"text","max":200},"migration_source":{"label":"Migratiebron","type":"text","max":200},"cost_centers":{"label":"Kostenplaatsen gewenst","type":"boolean"},"projects":{"label":"Projecten gewenst","type":"boolean"},"payroll":{"label":"Salarisadministratie","type":"boolean"},"employees":{"label":"Aantal werknemers","type":"integer","max":10000000},"setup_notes":{"label":"Inrichting en aandachtspunten","type":"text","max":4000},"vehicles":{"label":"Zakelijke voertuigen aanwezig","type":"boolean"},"vehicle_count":{"label":"Aantal voertuigen","type":"integer","max":100000},"vehicle_use":{"label":"Gebruik voertuigen","type":"enum","values":["owned","financial_lease","operational_lease","mixed","unknown"]},"vehicle_notes":{"label":"Interne toelichting voertuigen","type":"text","max":2000},"premises":{"label":"Bedrijfspand aanwezig","type":"boolean"},"premises_use":{"label":"Gebruik pand","type":"enum","values":["rented","owned","mixed","borrowed","other","unknown"]},"premises_same":{"label":"Pandadres gelijk aan bezoekadres","type":"boolean"},"premises_notes":{"label":"Interne toelichting pand","type":"text","max":2000},"klaas_vis":{"label":"Verzekeringen via Klaas Vis (opgave)","type":"enum","values":["yes","no","unknown","to_check"]},"insurance_notes":{"label":"Interne toelichting verzekeringsopgave","type":"text","max":2000}}},"banks":{"label":"Bankrekeningen","private":true,"collection":true,"fields":{"label":{"label":"Omschrijving","type":"text","max":200},"iban":{"label":"IBAN","type":"iban","max":34,"required":true}}},"services":{"label":"Diensten","private":true,"collection":true,"fields":{"service":{"label":"Dienst","type":"enum","values":["administration","vat","income_tax","corporate_tax","annual_accounts","payroll","reporting","guidance","meeting","other"]},"status":{"label":"Status","type":"enum","values":["active","ended"]},"started_on":{"label":"Startdatum","type":"date"},"ended_on":{"label":"Einddatum","type":"date"},"frequency":{"label":"Frequentie","type":"text","max":120},"responsible_id":{"label":"Verantwoordelijke medewerker","type":"staff"},"price_agreement":{"label":"Prijsafspraak (tekst)","type":"text","max":1000},"description":{"label":"Interne beschrijving","type":"text","max":2000}}},"agreements":{"label":"Afspraken","private":true,"fields":{"contact_frequency":{"label":"Contactfrequentie","type":"text","max":120},"meetings_per_year":{"label":"Gesprekken per jaar","type":"integer","max":366},"preferred_times":{"label":"Voorkeursdagen of dagdelen","type":"text","max":1000},"reporting":{"label":"Rapportageafspraken","type":"text","max":2000},"submission_deadline":{"label":"Aanleverdeadline","type":"text","max":500},"particulars":{"label":"Bijzonderheden","type":"text","max":2000}}},"notes":{"label":"Interne notities","private":true,"collection":true,"fields":{"title":{"label":"Titel","type":"text","max":200,"required":true},"body":{"label":"Inhoud","type":"text","max":6000,"required":true},"category":{"label":"Categorie","type":"text","max":80},"pinned":{"label":"Vastgepind","type":"boolean"}}}}'::jsonb $$;
revoke all on function public.office_cp_schema() from public,anon,authenticated;
alter table public.office_customer_company add column postal_same boolean;
alter table public.office_customer_company add column visit_country text check (length(visit_country)<=2);
alter table public.office_customer_company add column visit_postcode text check (length(visit_postcode)<=20);
alter table public.office_customer_company add column visit_house_number text check (length(visit_house_number)<=20);
alter table public.office_customer_company add column visit_addition text check (length(visit_addition)<=20);
alter table public.office_customer_company add column visit_street text check (length(visit_street)<=200);
alter table public.office_customer_company add column visit_city text check (length(visit_city)<=200);
alter table public.office_customer_company add column visit_municipality text check (length(visit_municipality)<=200);
alter table public.office_customer_company add column visit_bag_id text check (length(visit_bag_id)<=16);
alter table public.office_customer_company add column postal_country text check (length(postal_country)<=2);
alter table public.office_customer_company add column postal_postcode text check (length(postal_postcode)<=20);
alter table public.office_customer_company add column postal_house_number text check (length(postal_house_number)<=20);
alter table public.office_customer_company add column postal_addition text check (length(postal_addition)<=20);
alter table public.office_customer_company add column postal_street text check (length(postal_street)<=200);
alter table public.office_customer_company add column postal_city text check (length(postal_city)<=200);
alter table public.office_customer_company add column postal_municipality text check (length(postal_municipality)<=200);
alter table public.office_customer_company add column postal_bag_id text check (length(postal_bag_id)<=16);
alter table public.office_customer_administration add column vehicles boolean;
alter table public.office_customer_administration add column vehicle_count integer check (vehicle_count between 0 and 100000);
alter table public.office_customer_administration add column vehicle_use text check (vehicle_use in ('owned','financial_lease','operational_lease','mixed','unknown'));
alter table public.office_customer_administration add column vehicle_notes text check (length(vehicle_notes)<=2000);
alter table public.office_customer_administration add column premises boolean;
alter table public.office_customer_administration add column premises_use text check (premises_use in ('rented','owned','mixed','borrowed','other','unknown'));
alter table public.office_customer_administration add column premises_same boolean;
alter table public.office_customer_administration add column premises_notes text check (length(premises_notes)<=2000);
alter table public.office_customer_administration add column klaas_vis text check (klaas_vis in ('yes','no','unknown','to_check'));
alter table public.office_customer_administration add column insurance_notes text check (length(insurance_notes)<=2000);
alter table public.office_customer_fiscal add column income_tax_start date;
alter table public.office_customer_fiscal add column income_tax_confirm boolean;
alter table public.office_customer_fiscal add column vat_status text check (vat_status in ('regular','kor','exempt','mixed','not_liable','unknown'));
alter table public.office_customer_fiscal add column vat_status_start date;
alter table public.office_customer_fiscal add column vat_unity boolean;
alter table public.office_customer_fiscal add column vpb_unity boolean;
alter table public.office_customer_fiscal add column payroll_obligation boolean;
alter table public.office_customer_fiscal add column dividend_tax boolean;
alter table public.office_customer_fiscal add column other_obligations text check (length(other_obligations)<=1000);
alter table public.office_customer_fiscal add column tax_responsible_id uuid references public.profiles(id);
alter table public.office_customer_fiscal add column income_tax_confirmed_by uuid references public.profiles(id),add column income_tax_confirmed_at timestamptz;
alter table public.office_customer_company add column address_reviewed_at timestamptz,add column address_reviewed_by uuid references public.profiles(id);
alter table public.office_customer_company add column visit_source text check(visit_source in ('manual','pdok_suggestion')),add column visit_manual boolean,add column visit_checked_at timestamptz;
alter table public.office_customer_company add column postal_source text check(postal_source in ('manual','pdok_suggestion')),add column postal_manual boolean,add column postal_checked_at timestamptz;
-- Private helper preserves the existing authorization, concurrency and audit implementation.
alter function public.office_customer_profile_write(text,text,text,jsonb,bigint,text,boolean) rename to office_customer_profile_write_v1;
revoke all on function public.office_customer_profile_write_v1(text,text,text,jsonb,bigint,text,boolean) from public,anon,authenticated;
create function public.office_customer_profile_write(p_relationship_id text,p_organization_id text,p_section text,p_input jsonb,p_version bigint,p_record_id text default null,p_archive boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid;oid uuid;rid uuid;previous jsonb;merged jsonb;input jsonb;result jsonb;prefix text;k text;parent text;deps text[];i integer;changed_tax boolean;
begin
 actor:=public.office_cm_actor();oid:=public.office_cm_id(p_organization_id);rid:=public.office_cm_id(p_relationship_id);
 perform 1 from public.organizations o join public.customer_relationships r on r.id=o.customer_relationship_id where o.id=oid and r.id=rid and o.archived_at is null and r.archived_at is null for update of o,r;
 if not found then raise exception using errcode='P0002',message='Unavailable';end if;
 if p_archive then return public.office_customer_profile_write_v1(p_relationship_id,p_organization_id,p_section,p_input,p_version,p_record_id,p_archive);end if;
 input:=public.office_cp_input(p_section,p_input);
 if p_section in ('company','fiscal','administration') then
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1','office_customer_'||p_section) into previous using oid;
 merged:=coalesce(previous,'{}')||input;
 end if;
 if p_section='company' then
  foreach prefix in array array['visit','postal'] loop
   if merged->>(prefix||'_country')='NL' and input ? (prefix||'_postcode') and input->>(prefix||'_postcode') is not null then input:=input||jsonb_build_object(prefix||'_postcode',upper(regexp_replace(input->>(prefix||'_postcode'),'[[:space:]]','','g')));end if;
  end loop;
  merged:=coalesce(previous,'{}')||input;
  foreach prefix in array array['visit','postal'] loop
   if merged->>(prefix||'_country') is not null and merged->>(prefix||'_country') !~ '^[A-Z]{2}$' then raise exception using errcode='22023',message='Invalid country';end if;
   if merged->>(prefix||'_bag_id') is not null and merged->>(prefix||'_bag_id') !~ '^[0-9]{16}$' then raise exception using errcode='22023',message='Invalid BAG';end if;
   if merged->>(prefix||'_country')='NL' then
    if merged->>(prefix||'_postcode') is not null and merged->>(prefix||'_postcode') !~ '^[1-9][0-9]{3}[A-Z]{2}$' then raise exception using errcode='22023',message='Invalid postcode';end if;
    if merged->>(prefix||'_house_number') is not null and merged->>(prefix||'_house_number') !~ '^[1-9][0-9]{0,4}$' then raise exception using errcode='22023',message='Invalid house number';end if;
   end if;
  end loop;
  if merged->>'postal_same'='true' then
   foreach k in array array['country','postcode','house_number','addition','street','city','municipality','bag_id','source','manual'] loop input:=input||jsonb_build_object('postal_'||k,merged->('visit_'||k));end loop;
  end if;
 end if;
 if p_section in ('administration','fiscal') then
  for i in 1..3 loop
   parent:=case i when 1 then 'vehicles' when 2 then 'premises' else 'payroll_obligation' end;
   deps:=case i when 1 then array['vehicle_count','vehicle_use','vehicle_notes'] when 2 then array['premises_use','premises_same','premises_notes'] else array['payroll_period'] end;
   if (p_section='administration' and i<3) or (p_section='fiscal' and i=3) then
    if input ? parent and input->>parent is distinct from 'true' then
     foreach k in array deps loop
      if input->>k is not null or (previous->>k is not null and not input ? k) then raise exception using errcode='22023',message='Confirm dependent removal';end if;
      input:=input||jsonb_build_object(k,null);
     end loop;
    elsif merged->>parent is distinct from 'true' then
     foreach k in array deps loop if input->>k is not null then raise exception using errcode='22023',message='Inactive dependency';end if;end loop;
    end if;
   end if;
  end loop;
  if p_section='administration' and merged->>'vehicles'='true' and merged->>'vehicle_count' is not null and (merged->>'vehicle_count')::integer<1 then raise exception using errcode='22023',message='Invalid vehicle count';end if;
 end if;
 if p_section='fiscal' then
  if input ? 'fiscal_unity' then raise exception using errcode='22023',message='Historical field is read only';end if;
  changed_tax:=(input ? 'income_tax' and input->'income_tax' is distinct from previous->'income_tax') or (input ? 'income_tax_start' and input->'income_tax_start' is distinct from previous->'income_tax_start');
  if changed_tax and merged->>'income_tax' is not null and merged->>'income_tax'<>'unknown' and input->>'income_tax_confirm' is distinct from 'true' then raise exception using errcode='22023',message='Explicit confirmation required';end if;
  if input ? 'vat_status' then
   input:=input||jsonb_build_object('kor',case when input->>'vat_status'='unknown' or input->>'vat_status' is null then null else input->>'vat_status'='kor' end,'vat_liable',case when input->>'vat_status'='regular' then true when input->>'vat_status'='not_liable' then false else null end);
  elsif merged->>'vat_status' is not null and (input ? 'kor' or input ? 'vat_liable') then raise exception using errcode='22023',message='Edit explicit VAT status';end if;
 end if;
 result:=public.office_customer_profile_write_v1(p_relationship_id,p_organization_id,p_section,input,p_version,p_record_id,p_archive);
 if p_section='fiscal' and (changed_tax or input ? 'income_tax_confirm') then
  update public.office_customer_fiscal set income_tax_confirmed_by=case when income_tax_confirm is true and income_tax is not null and income_tax<>'unknown' then actor end,income_tax_confirmed_at=case when income_tax_confirm is true and income_tax is not null and income_tax<>'unknown' then clock_timestamp() end where organization_id=oid;
 end if;
 if p_section='company' and exists(select 1 from jsonb_object_keys(input) as c(field) where c.field like 'visit_%' or c.field like 'postal_%') then
  update public.office_customer_company set address_reviewed_at=clock_timestamp(),address_reviewed_by=actor,visit_checked_at=case when exists(select 1 from jsonb_object_keys(input) as c(field) where c.field like 'visit_%') then clock_timestamp() else visit_checked_at end,postal_checked_at=case when exists(select 1 from jsonb_object_keys(input) as c(field) where c.field like 'postal_%') then clock_timestamp() else postal_checked_at end where organization_id=oid;
 end if;
 return result;
end $$;
revoke all on function public.office_customer_profile_write(text,text,text,jsonb,bigint,text,boolean) from public,anon;
grant execute on function public.office_customer_profile_write(text,text,text,jsonb,bigint,text,boolean) to authenticated;
create function public.office_create_relationship_from_kvk_intake(p_profile jsonb,p_manual jsonb,p_environment text,p_checked_at timestamptz,p_server_key text,p_intake jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;section text;fields jsonb;v bigint;
begin
 perform public.office_cm_actor();
 if p_intake is null or jsonb_typeof(p_intake)<>'object' or octet_length(p_intake::text)>16000 then raise exception using errcode='22023',message='Invalid intake';end if;
 for section in select jsonb_object_keys(p_intake) loop if section not in ('company','administration','fiscal') then raise exception using errcode='22023',message='Invalid section';end if;end loop;
 result:=public.office_create_relationship_from_kvk(p_profile,p_manual,p_environment,p_checked_at,p_server_key);
 for section,fields in select * from jsonb_each(p_intake) loop
  if section='fiscal' and fields->>'tax_responsible_id' is null then fields:=fields||jsonb_build_object('tax_responsible_id',auth.uid());end if;
  if section='company' then fields:=fields||jsonb_build_object('name',p_profile->>'name','legal_name',p_profile->>'legalName');end if;
  select coalesce((select version from public.office_customer_versions where organization_id=(result->>'organization_id')::uuid),0) into v;
  perform public.office_customer_profile_write(result->>'relationship_id',result->>'organization_id',section,fields,v);
 end loop;
 return result;
end $$;
revoke all on function public.office_create_relationship_from_kvk_intake(jsonb,jsonb,text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.office_create_relationship_from_kvk_intake(jsonb,jsonb,text,timestamptz,text,jsonb) to authenticated;
-- Distributed per-user throttle; no addresses are retained here.
create table public.office_address_lookup_limits(user_id uuid primary key references public.profiles(id),window_start timestamptz not null,requests integer not null check(requests between 1 and 30));
alter table public.office_address_lookup_limits enable row level security;
revoke all on public.office_address_lookup_limits from public,anon,authenticated;
create function public.office_address_lookup_allow() returns boolean language plpgsql security definer set search_path=public as $$
declare actor uuid;allowed boolean;
begin
 actor:=public.office_cm_actor();
 insert into public.office_address_lookup_limits as l values(actor,clock_timestamp(),1)
 on conflict(user_id) do update set window_start=case when l.window_start<=clock_timestamp()-interval '1 minute' then clock_timestamp() else l.window_start end,requests=case when l.window_start<=clock_timestamp()-interval '1 minute' then 1 else l.requests+1 end
 where l.window_start<=clock_timestamp()-interval '1 minute' or l.requests<30 returning true into allowed;
 return coalesce(allowed,false);
end $$;
revoke all on function public.office_address_lookup_allow() from public,anon;
grant execute on function public.office_address_lookup_allow() to authenticated;
commit;
