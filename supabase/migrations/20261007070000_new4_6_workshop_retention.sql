-- NEW4-6 — Workshop image retention clocks.
-- Additive. Do NOT modify NEW4-5 / NEW4-5A migrations.
-- Source-only. Do NOT apply to production from this ticket.
--
-- Adds:
--   orders.completed_at     — set only when status transitions INTO COMPLETED
--   orders.image_purged_at  — set only by service_role after a successful purge
--
-- Does NOT:
--   - fabricate completed_at from created_at or payment time
--   - backfill historical COMPLETED rows
--   - remove Storage catalog rows directly (physical object removal is Storage API .remove())
--   - publish customer-facing 3-day copy
--   - configure a production scheduler

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS image_purged_at timestamptz;

COMMENT ON COLUMN public.orders.completed_at IS
  'NEW4-6: server clock when status first enters COMPLETED on this cycle. Null for historical COMPLETED rows with no trustworthy operator completion time. Not derived from created_at or payment_finalized_at.';

COMMENT ON COLUMN public.orders.image_purged_at IS
  'NEW4-6: set only after Workshop customer-image Storage objects for this order were removed via the Storage API and stale image references were cleaned. Null means not successfully purged.';

CREATE INDEX IF NOT EXISTS orders_workshop_completed_purge_idx
  ON public.orders (completed_at)
  WHERE status = 'COMPLETED'
    AND completed_at IS NOT NULL
    AND image_purged_at IS NULL;

CREATE OR REPLACE FUNCTION public.orders_workshop_retention_clock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := coalesce(auth.role(), '');

  IF TG_OP = 'INSERT' THEN
    NEW.completed_at := CASE
      WHEN NEW.status = 'COMPLETED' THEN pg_catalog.now()
      ELSE NULL
    END;
    NEW.image_purged_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    IF OLD.image_purged_at IS NULL THEN
      NEW.completed_at := pg_catalog.now();
    ELSE
      NEW.completed_at := OLD.completed_at;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'COMPLETED' AND OLD.status = 'COMPLETED' THEN
    IF OLD.image_purged_at IS NULL THEN
      NEW.completed_at := NULL;
    ELSE
      NEW.completed_at := OLD.completed_at;
    END IF;
  ELSE
    NEW.completed_at := OLD.completed_at;
  END IF;

  IF v_role IS DISTINCT FROM 'service_role' THEN
    NEW.image_purged_at := OLD.image_purged_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_workshop_retention_clock ON public.orders;

CREATE TRIGGER trg_orders_workshop_retention_clock
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_workshop_retention_clock();

COMMIT;
