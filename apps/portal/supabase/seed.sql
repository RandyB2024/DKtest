-- Alleen uitvoeren in het afzonderlijke testproject. Auth-gebruikers worden eerst invite-only aangemaakt.
insert into public.customer_relationships(id,name,status) values('10000000-0000-4000-8000-000000000001','Destination Known testklant','active') on conflict do nothing;
insert into public.organizations(id,customer_relationship_id,name,legal_name,test_record) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Jansen Bouw Test B.V.','Jansen Bouw Test B.V.',true) on conflict do nothing;
