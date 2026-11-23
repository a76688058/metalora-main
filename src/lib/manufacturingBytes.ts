/**
 * Server-only bytes for a purchased original and its manufacturing artifact.
 * Artifact keys are never accepted from the client and are not sign-read paths.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WORKSHOP_BUCKET,
  isManufacturingArtifactKey,
  parseWorkshopRef,
  type WorkshopGcsObjectStore,
  type WorkshopRefOptions,
} from './workshopStorage';

export type ManufacturingByteAccess = {
  readonly persistent: boolean;
  readOriginal(ref: string): Promise<Buffer | null>;
  readArtifact(key: string): Promise<Buffer | null>;
  writeArtifact(key: string, bytes: Buffer): Promise<'written' | 'exists'>;
};

type GcsBytes = {
  readCanonicalBytes(path: string): Promise<Buffer | null>;
  readManufacturingBytes(key: string): Promise<Buffer | null>;
  writeManufacturingBytes(key: string, bytes: Buffer): Promise<'written' | 'exists'>;
};

function manufacturingStore(store: WorkshopGcsObjectStore | null): GcsBytes | null {
  if (!store?.readCanonicalBytes || !store.readManufacturingBytes || !store.writeManufacturingBytes) return null;
  return {
    readCanonicalBytes: (path) => store.readCanonicalBytes!(path),
    readManufacturingBytes: (key) => store.readManufacturingBytes!(key),
    writeManufacturingBytes: (key, bytes) => store.writeManufacturingBytes!(key, bytes),
  };
}

function missingObject(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('not found') || lower.includes('not_found') || lower.includes('does not exist');
}

async function downloadLegacy(admin: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await admin.storage.from(WORKSHOP_BUCKET).download(path);
  if (error || !data) {
    if (error && missingObject(error.message)) return null;
    throw new Error('legacy_read_failed');
  }
  return Buffer.from(await data.arrayBuffer());
}

async function uploadLegacy(admin: SupabaseClient, key: string, bytes: Buffer): Promise<'written' | 'exists'> {
  const { error } = await admin.storage.from(WORKSHOP_BUCKET).upload(key, bytes, {
    contentType: 'image/png',
    cacheControl: 'private, no-store',
    upsert: false,
  });
  if (!error) return 'written';
  const message = error.message.toLowerCase();
  if (message.includes('already') || message.includes('exists') || message.includes('duplicate')) return 'exists';
  throw new Error('legacy_write_failed');
}

export function createOrderManufacturingAccess(input: {
  gcs: WorkshopGcsObjectStore | null;
  legacy: SupabaseClient | null;
  refOptions: WorkshopRefOptions;
}): ManufacturingByteAccess {
  const gcs = manufacturingStore(input.gcs);
  return {
    persistent: gcs != null || input.legacy != null,
    async readOriginal(ref) {
      const parsed = parseWorkshopRef(ref, input.refOptions);
      if (!parsed || parsed.kind !== 'original') return null;
      if (parsed.source === 'canonical') {
        if (gcs) return gcs.readCanonicalBytes(parsed.path);
        if (input.legacy) return downloadLegacy(input.legacy, parsed.path);
        return null;
      }
      if (!input.legacy) return null;
      return downloadLegacy(input.legacy, parsed.path);
    },
    async readArtifact(key) {
      if (!isManufacturingArtifactKey(key)) return null;
      if (gcs) return gcs.readManufacturingBytes(key);
      if (input.legacy) return downloadLegacy(input.legacy, key);
      return null;
    },
    async writeArtifact(key, bytes) {
      if (!isManufacturingArtifactKey(key)) throw new Error('artifact_key');
      if (gcs) return gcs.writeManufacturingBytes(key, bytes);
      if (input.legacy) return uploadLegacy(input.legacy, key, bytes);
      throw new Error('artifact_store_absent');
    },
  };
}
