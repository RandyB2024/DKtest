-- Hard TOTP lifetime. Existing policy definitions and applied migrations stay intact.
begin;

-- Strengthen the existing predicate so Storage and SECURITY DEFINER business
-- RPCs using has_aal2() enforce the same limit as table RLS and the HTTP servers.
create or replace function public.has_aal2() returns boolean
language plpgsql stable set search_path = public as $$
declare claims jsonb := auth.jwt(); entry jsonb; stamp numeric; latest numeric := 0;
  current_seconds numeric := extract(epoch from statement_timestamp());
begin
  if claims->>'aal' is distinct from 'aal2' or jsonb_typeof(claims->'amr') is distinct from 'array' then return false; end if;
  if jsonb_array_length(claims->'amr')=0 then return false; end if;
  for entry in select value from jsonb_array_elements(claims->'amr') loop
    if jsonb_typeof(entry) is distinct from 'object'
       or jsonb_typeof(entry->'method') is distinct from 'string' or entry->>'method'=''
       or jsonb_typeof(entry->'timestamp') is distinct from 'number' then return false; end if;
    stamp := (entry->>'timestamp')::numeric;
    if stamp <= 0 or stamp > 9007199254740991 or stamp <> trunc(stamp) or stamp > current_seconds then return false; end if;
    if entry->>'method'='totp' then latest := greatest(latest,stamp); end if;
  end loop;
  -- No clock-skew grace, and no use of iat/refresh/activity timestamps.
  return latest > 0 and current_seconds < latest + 86400;
exception when others then return false;
end $$;
revoke all on function public.has_aal2() from public,anon;
grant execute on function public.has_aal2() to authenticated;

-- Bootstrap retains own profile, memberships and associated roles. Business
-- data (including customer organization reads) always requires fresh MFA.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'customer_relationships','organization_groups','organizations','permissions',
    'role_permissions','organization_features','customer_invitations','debtors',
    'sales_invoices','sales_invoice_lines','payments','documents','document_requests',
    'conversations','conversation_participants','messages','appointments','tasks',
    'notifications','audit_events'
  ] loop
    execute format('create policy trusted_totp_24h_required on public.%I as restrictive for all to authenticated using (public.has_aal2()) with check (public.has_aal2())',table_name);
  end loop;
end $$;
commit;
