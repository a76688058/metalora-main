# Supabase schema source of truth

## Authoritative state

**Live Supabase is currently authoritative.**

Incremental hardening and constraints live in `supabase/migrations/*`. Those files document changes applied to the shared production project (and test project). They are not a complete bootstrap from an empty database.

## Historical files (do not replay)

| File | Status |
|------|--------|
| `../supabase-schema.sql` | Historical bootstrap DDL only. Structurally stale vs live (e.g. `products.id` type, `order_items` shape, `inquiries` vs `cs_inquiries`). |
| `../supabase_security_setup.sql` | Pre-#16A RLS snapshot. Contains permissive/stale policies. |

**Never replay historical bootstrap SQL against production or shared Supabase.**

## Fresh-project baseline

The current migration chain assumes an existing live-shaped schema. It is **not sufficient** to bootstrap an empty project.

A trustworthy baseline must come from an **authoritative live schema export**, not from manually guessing current DDL. That export is still pending.

## Deferred schema topics

- `profiles.user_custom_id` contract (NOT NULL and related constraints deferred)
- `orders.status` normalization (mixed EN/KR values in app; no CHECK yet)

## Later repo cleanup (not done here)

- `src/pages/AdminBanners.tsx` embedded bootstrap SQL
- `src/types/database.ts` phantom product fields
