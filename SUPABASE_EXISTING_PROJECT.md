# Existing Supabase project

The project keeps the current Supabase account and existing application tables.

Run only `supabase/migrations/007_custom_api.sql` for the custom API layer.

After running it, verify:

```sql
select
  to_regclass('public.api_cache') as api_cache,
  to_regclass('public.api_request_usage') as api_request_usage,
  to_regclass('public.booking_codes') as booking_codes,
  to_regclass('public.booking_code_selections') as booking_code_selections;
```

Each column should return a table name rather than `null`.

The custom server uses the service-role key for cache writes, usage accounting, and administrator writes. Public browser access remains controlled through Row Level Security.
