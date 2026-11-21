-- READ ONLY. Predicate and ledger facts. No table data.
SELECT count(*)::int AS ledger_rows
FROM supabase_migrations.schema_migrations;

SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;

SELECT p.proname AS name,
       pg_get_function_identity_arguments(p.oid) AS args,
       md5(p.prosrc) AS src_md5,
       (position('간편결제' in p.prosrc) > 0) AS has_easy_ko,
       (position('EASY_PAY' in p.prosrc) > 0) AS has_easy_en,
       (position('IS DISTINCT FROM ''카드''' in p.prosrc) > 0) AS distinct_card,
       (position('= ''카드''' in p.prosrc) > 0) AS eq_card
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'apply_provider_capture_observation',
    'finalize_paid_order',
    'begin_full_order_cancellation',
    'claim_full_order_cancellation',
    'mark_full_order_cancellation',
    'finalize_full_order_cancellation',
    'record_provider_capture_attempt'
  )
ORDER BY 1, 2;

SELECT p.proname AS name, btrim(line) AS line
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL regexp_split_to_table(p.prosrc, E'\n') AS line
WHERE n.nspname = 'public'
  AND p.proname IN (
    'apply_provider_capture_observation',
    'finalize_paid_order',
    'begin_full_order_cancellation'
  )
  AND line ~ '카드|EASY_PAY|간편결제|payment_method'
ORDER BY 1, 2;
