begin;
alter table public.tasks add column scope text not null default 'customer' check(scope in ('customer','office'));
alter table public.tasks add constraint office_task_fields check(scope <> 'office' or (length(btrim(title)) between 1 and 200 and assigned_to is not null and due_at is not null and status in ('open','completed')));
create index office_tasks_due on public.tasks(due_at,id) where scope='office' and status='open';
create index office_tasks_organization on public.tasks(organization_id,due_at,id) where scope='office' and status='open';
create policy office_tasks_boundary on public.tasks as restrictive for all to authenticated
using(scope <> 'office' or (public.is_office_user() and public.has_aal2() and exists(select 1 from public.organizations o join public.customer_relationships r on r.id=o.customer_relationship_id where o.id=tasks.organization_id and o.archived_at is null and r.archived_at is null)))
with check(scope <> 'office' or (public.is_office_user() and public.has_aal2()));

create function public.office_task_create(p_relationship_id uuid,p_organization_id uuid,p_title text,p_assigned_to uuid,p_deadline date) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; target uuid;
begin
 actor:=public.office_cm_actor();
 if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_deadline is null or not isfinite(p_deadline) or p_deadline not between date '1900-01-01' and date '9999-12-31' then raise exception using errcode='22023',message='Invalid task'; end if;
 perform 1 from public.organizations o join public.customer_relationships r on r.id=o.customer_relationship_id where o.id=p_organization_id and r.id=p_relationship_id and o.archived_at is null and r.archived_at is null for share of o,r;
 if not found then raise exception using errcode='P0002',message='Unavailable'; end if;
 perform 1 from public.profiles p join public.office_memberships m on m.user_id=p.id join public.roles r on r.id=m.role_id where p.id=p_assigned_to and p.account_status='active' and m.status='active' and r.scope='office' and r.code in ('owner','admin','accountant','handler','viewer') for share of p,m,r;
 if not found then raise exception using errcode='22023',message='Invalid assignee'; end if;
 insert into public.tasks(organization_id,title,status,assigned_to,due_at,created_by,scope) values(p_organization_id,btrim(p_title),'open',p_assigned_to,p_deadline::timestamp at time zone 'Europe/Amsterdam',actor,'office') returning id into target;
 perform public.office_cm_audit(actor,p_relationship_id,p_organization_id,'task.created','task',target,'["title","assigned_to","due_at","status"]'::jsonb);
 return target;
end $$;
create function public.office_task_complete(p_relationship_id uuid,p_organization_id uuid,p_task_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; target public.tasks%rowtype;
begin
 actor:=public.office_cm_actor();
 perform 1 from public.organizations o join public.customer_relationships r on r.id=o.customer_relationship_id where o.id=p_organization_id and r.id=p_relationship_id and o.archived_at is null and r.archived_at is null for share of o,r;
 if not found then raise exception using errcode='P0002',message='Unavailable'; end if;
 select * into target from public.tasks where id=p_task_id and organization_id=p_organization_id and scope='office' for update;
 if not found then raise exception using errcode='P0002',message='Unavailable'; end if;
 if target.status='completed' then return target.id; end if;
 update public.tasks set status='completed' where id=target.id;
 perform public.office_cm_audit(actor,p_relationship_id,p_organization_id,'task.completed','task',target.id,'["status"]'::jsonb);
 return target.id;
end $$;
-- Invoker reads keep the existing table RLS effective, also through PostgREST RPC.
create function public.office_tasks_read(p_relationship_id uuid default null,p_organization_id uuid default null,p_bucket text default 'client',p_page integer default 1) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare result jsonb; today date:=(now() at time zone 'Europe/Amsterdam')::date;
begin
 if auth.uid() is null or not public.is_office_user() or not public.has_aal2() then raise exception using errcode='42501',message='Denied'; end if;
 if p_bucket is null or p_bucket not in ('client','today','overdue') or p_page is null or p_page not between 1 and 10000 then raise exception using errcode='22023',message='Invalid query'; end if;
 if p_bucket='client' then
  perform 1 from public.organizations o join public.customer_relationships r on r.id=o.customer_relationship_id where o.id=p_organization_id and r.id=p_relationship_id and o.archived_at is null and r.archived_at is null;
  if not found then raise exception using errcode='P0002',message='Unavailable'; end if;
 elsif p_relationship_id is not null or p_organization_id is not null then raise exception using errcode='22023',message='Invalid query'; end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
 select t.id,t.title,t.status,t.assigned_to,p.display_name as assignee,(t.due_at at time zone 'Europe/Amsterdam')::date as deadline,o.id as organization_id,o.name as organization_name,r.id as relationship_id,r.name as relationship_name
 from public.tasks t join public.organizations o on o.id=t.organization_id join public.customer_relationships r on r.id=o.customer_relationship_id left join public.profiles p on p.id=t.assigned_to
 where t.scope='office' and t.status='open' and o.archived_at is null and r.archived_at is null and
 ((p_bucket='client' and o.id=p_organization_id and r.id=p_relationship_id) or (p_bucket='today' and (t.due_at at time zone 'Europe/Amsterdam')::date=today) or (p_bucket='overdue' and (t.due_at at time zone 'Europe/Amsterdam')::date<today))
 order by t.due_at,t.id limit 26 offset (p_page-1)*25) q;
 return jsonb_build_object('items',coalesce((select jsonb_agg(value) from jsonb_array_elements(result) with ordinality a(value,n) where n<=25),'[]'::jsonb),'hasMore',jsonb_array_length(result)>25);
end $$;
revoke all on function public.office_task_create(uuid,uuid,text,uuid,date),public.office_task_complete(uuid,uuid,uuid),public.office_tasks_read(uuid,uuid,text,integer) from public,anon;
grant execute on function public.office_task_create(uuid,uuid,text,uuid,date),public.office_task_complete(uuid,uuid,uuid),public.office_tasks_read(uuid,uuid,text,integer) to authenticated;
commit;
