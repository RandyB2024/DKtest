begin;

create extension if not exists pgcrypto;

create table if not exists public.personal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null,
  source text not null default 'office'
    check (source in ('customer', 'office', 'email', 'system')),
  status text not null default 'new'
    check (status in ('new', 'in_review', 'needs_customer_action', 'ready', 'processed', 'archived')),
  document_type text not null default 'other'
    check (document_type in ('tax_document', 'insurance', 'identity', 'lifeplan', 'coaching', 'wealth', 'other')),
  book_year integer null,
  book_month integer null check (book_month between 1 and 12),
  archive_folder_name text null,
  visible_to_customer boolean not null default true,
  customer_action_required boolean not null default false,
  acknowledgement_required boolean not null default false,
  notes text null,
  processed_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.personal_document_receipts (
  document_id uuid not null references public.personal_documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz null,
  acknowledged_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (document_id, user_id)
);

create index if not exists idx_personal_documents_user_created
  on public.personal_documents (user_id, created_at desc);

create index if not exists idx_personal_documents_user_status
  on public.personal_documents (user_id, status);

create index if not exists idx_personal_documents_archive
  on public.personal_documents (user_id, book_year, book_month, archive_folder_name);

create or replace function public.set_personal_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_personal_documents_updated_at on public.personal_documents;
create trigger trg_personal_documents_updated_at
before update on public.personal_documents
for each row
execute function public.set_personal_documents_updated_at();

drop trigger if exists trg_personal_document_receipts_updated_at on public.personal_document_receipts;
create trigger trg_personal_document_receipts_updated_at
before update on public.personal_document_receipts
for each row
execute function public.set_personal_documents_updated_at();

alter table public.personal_documents enable row level security;
alter table public.personal_document_receipts enable row level security;

drop policy if exists "personal_documents_select_own" on public.personal_documents;
create policy "personal_documents_select_own"
on public.personal_documents
for select
to authenticated
using (
  auth.uid() = user_id
  and visible_to_customer = true
);

drop policy if exists "personal_document_receipts_select_own" on public.personal_document_receipts;
create policy "personal_document_receipts_select_own"
on public.personal_document_receipts
for select
to authenticated
using (
  auth.uid() = user_id
);

drop policy if exists "personal_document_receipts_insert_own" on public.personal_document_receipts;
create policy "personal_document_receipts_insert_own"
on public.personal_document_receipts
for insert
to authenticated
with check (
  auth.uid() = user_id
);

drop policy if exists "personal_document_receipts_update_own" on public.personal_document_receipts;
create policy "personal_document_receipts_update_own"
on public.personal_document_receipts
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

commit;
