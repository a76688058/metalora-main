-- NEW 2B-5C — Payment-test Workshop Storage contract
-- Repository-tracked Storage provisioning for Custom original/preview persistence.
-- Apply to payment-test (bvihpoorwriejybixmoc) only from the 2B-5C Storage ticket.
-- NOT applied to production (qifloweuwyhvukabgnoa). No server deploy.
--
-- Scope:
--   - public `workshop` bucket
--   - authenticated INSERT/DELETE limited to
--       originals/<auth.uid()>/...
--       previews/<auth.uid()>/...
--   - public SELECT so 2B-5C getPublicUrl() reads work
-- Does NOT:
--   - invent a file-size cap
--   - grant UPDATE (2B-5C uploads use upsert: false)
--   - restore legacy bucket-root WRITE
--   - modify 2B-5A price/RPC objects
--   - add HEIC

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workshop',
  'workshop',
  true,
  NULL,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = true,
  file_size_limit = NULL,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "workshop_public_select" ON storage.objects;
DROP POLICY IF EXISTS "workshop_authenticated_insert_own_canonical" ON storage.objects;
DROP POLICY IF EXISTS "workshop_authenticated_delete_own_canonical" ON storage.objects;

CREATE POLICY "workshop_public_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'workshop');

CREATE POLICY "workshop_authenticated_insert_own_canonical"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'workshop'
  AND (storage.foldername(name))[1] IN ('originals', 'previews')
  AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
);

CREATE POLICY "workshop_authenticated_delete_own_canonical"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'workshop'
  AND (storage.foldername(name))[1] IN ('originals', 'previews')
  AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
);

COMMIT;
