begin;

-- ============================================================
-- BESTEMD 024
-- PRIVATE STORAGE VOOR DEFINITIEVE FACTUUR-PDF'S
-- ============================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'invoice-pdfs',
  'invoice-pdfs',
  false,
  10485760,
  array[
    'application/pdf'
  ]::text[]
)
on conflict (id)
do update set
  name =
    excluded.name,

  public =
    false,

  file_size_limit =
    excluded.file_size_limit,

  allowed_mime_types =
    excluded.allowed_mime_types;


commit;
