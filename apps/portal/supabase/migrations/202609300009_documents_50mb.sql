-- ============================================================
-- 202609300009_documents_50mb.sql
--
-- Verhoog maximale documentgrootte van 10 MB naar 50 MB.
-- ============================================================

begin;

update storage.buckets
set file_size_limit = 52428800
where id = 'documents';

commit;
