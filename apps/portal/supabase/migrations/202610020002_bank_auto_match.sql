begin;

create or replace function public.auto_match_bank_transactions(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestions jsonb;
  v_item jsonb;
  v_suggestion jsonb;

  v_transaction_id uuid;
  v_invoice_id uuid;
  v_invoice_type text;
  v_score integer;

  v_matched integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;

  v_result jsonb := '[]'::jsonb;
begin

  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;

  if not public.is_office_user() then
    raise exception using
      errcode = '42501',
      message = 'Alleen Office mag automatische bankmatches verwerken.';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = p_organization_id
      and archived_at is null
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'Onderneming niet gevonden.';
  end if;

  v_suggestions :=
    public.get_bank_match_suggestions(
      p_organization_id,
      500
    );

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(
        v_suggestions,
        '[]'::jsonb
      )
    )
  loop

    v_suggestion :=
      v_item -> 'suggestion';

    if
      v_suggestion is null
      or v_suggestion = 'null'::jsonb
    then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_score :=
      coalesce(
        (
          v_suggestion ->> 'score'
        )::integer,
        0
      );

    -- Alleen de strengste match wordt automatisch verwerkt.
    if v_score <> 100 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin

      v_transaction_id :=
        (
          v_item ->> 'transactionId'
        )::uuid;

      v_invoice_id :=
        (
          v_suggestion ->> 'invoiceId'
        )::uuid;

      v_invoice_type :=
        v_suggestion ->> 'invoiceType';

      perform public.confirm_bank_match(
        p_organization_id,
        v_transaction_id,
        v_invoice_id,
        v_invoice_type
      );

      v_matched :=
        v_matched + 1;

      v_result :=
        v_result ||
        jsonb_build_array(
          jsonb_build_object(
            'transactionId',
              v_transaction_id,

            'invoiceId',
              v_invoice_id,

            'invoiceType',
              v_invoice_type,

            'score',
              v_score,

            'status',
              'matched'
          )
        );

    exception
      when others then

        v_failed :=
          v_failed + 1;

        v_result :=
          v_result ||
          jsonb_build_array(
            jsonb_build_object(
              'transactionId',
                v_item ->> 'transactionId',

              'status',
                'failed'
            )
          );

    end;

  end loop;

  insert into public.audit_events (
    actor_id,
    organization_id,
    action,
    object_type,
    object_id,
    result,
    metadata
  )
  values (
    auth.uid(),
    p_organization_id,
    'bank_auto_match_run',
    'organization',
    p_organization_id,
    'success',
    jsonb_build_object(
      'matched',
        v_matched,

      'skipped',
        v_skipped,

      'failed',
        v_failed
    )
  );

  return jsonb_build_object(
    'matched',
      v_matched,

    'skipped',
      v_skipped,

    'failed',
      v_failed,

    'items',
      v_result
  );

end;
$$;


revoke all
on function public.auto_match_bank_transactions(
  uuid
)
from public, anon;


grant execute
on function public.auto_match_bank_transactions(
  uuid
)
to authenticated;


commit;
