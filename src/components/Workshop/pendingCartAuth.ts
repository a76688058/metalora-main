/** Redirect-safe Workshop cart intent. Session JSON is numbers only. The original File lives in IndexedDB. */

export const WORKSHOP_PENDING_ADD_KEY = 'metalora-workshop-pending-add';

const DB_NAME = 'metalora-workshop-pending';
const STORE = 'original';
const RECORD_ID = 'pending-original';
/** Auth round-trip bound. Not a product or retention rule. */
const TTL_MS = 30 * 60 * 1000;

export type WorkshopPendingAdd = {
  v: 1;
  step: 1 | 2;
  orientation: 'portrait' | 'landscape';
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type StoredOriginal = {
  file: File;
  savedAt: number;
};

export type PendingAddClaim =
  | { status: 'ready'; pending: WorkshopPendingAdd; file: File }
  | { status: 'none' }
  | { status: 'reselect' };

let claimCache: Promise<PendingAddClaim> | null = null;
let deliveryTaken = false;

/** Lets one mounted resume apply the claimed file. A discarded intent cannot apply. */
export function takeResumeDelivery(): boolean {
  if (deliveryTaken) return false;
  deliveryTaken = true;
  return true;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseWorkshopPendingAdd(raw: unknown): WorkshopPendingAdd | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.v !== 1) return null;
  if (value.step !== 1 && value.step !== 2) return null;
  if (value.orientation !== 'portrait' && value.orientation !== 'landscape') return null;
  if (!finiteNumber(value.zoom) || !finiteNumber(value.offsetX) || !finiteNumber(value.offsetY)) return null;
  if ('originalRef' in value || 'preview' in value || 'file' in value || 'blob' in value || 'signedUrl' in value) {
    return null;
  }
  return {
    v: 1,
    step: value.step,
    orientation: value.orientation,
    zoom: value.zoom,
    offsetX: value.offsetX,
    offsetY: value.offsetY,
  };
}

function readPendingMeta(): WorkshopPendingAdd | null {
  try {
    const raw = sessionStorage.getItem(WORKSHOP_PENDING_ADD_KEY);
    if (!raw) return null;
    return parseWorkshopPendingAdd(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function hasWorkshopPendingAdd(): boolean {
  return readPendingMeta() !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function deleteStoredOriginal(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(RECORD_ID));
  } catch {
    // The session flag is the source of intent. A failed delete is retried by the orphan sweep.
  }
}

export function discardWorkshopPendingAddSync(): void {
  try {
    sessionStorage.removeItem(WORKSHOP_PENDING_ADD_KEY);
  } catch {
    // ignore
  }
  claimCache = Promise.resolve({ status: 'none' });
  deliveryTaken = true;
  void deleteStoredOriginal();
}

export async function clearWorkshopPendingAdd(): Promise<void> {
  discardWorkshopPendingAddSync();
}

export async function saveWorkshopPendingAdd(
  pending: WorkshopPendingAdd,
  file: File,
): Promise<boolean> {
  if (!parseWorkshopPendingAdd(pending)) return false;
  claimCache = null;
  deliveryTaken = false;
  try {
    await withStore('readwrite', (store) => store.put(
      { file, savedAt: Date.now() } satisfies StoredOriginal,
      RECORD_ID,
    ));
  } catch {
    return false;
  }
  try {
    sessionStorage.setItem(WORKSHOP_PENDING_ADD_KEY, JSON.stringify(pending));
    return true;
  } catch {
    await deleteStoredOriginal();
    return false;
  }
}

async function claimOnce(): Promise<PendingAddClaim> {
  const pending = readPendingMeta();
  if (!pending) {
    await deleteStoredOriginal();
    return { status: 'none' };
  }
  try {
    sessionStorage.removeItem(WORKSHOP_PENDING_ADD_KEY);
  } catch {
    await deleteStoredOriginal();
    return { status: 'reselect' };
  }
  try {
    const record = await withStore<StoredOriginal | undefined>('readonly', (store) => store.get(RECORD_ID));
    const savedAt = record?.savedAt;
    const file = record?.file;
    if (!(file instanceof File) || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
      await deleteStoredOriginal();
      return { status: 'reselect' };
    }
    if (Date.now() - savedAt > TTL_MS) {
      await deleteStoredOriginal();
      return { status: 'reselect' };
    }
    return { status: 'ready', pending, file };
  } catch {
    await deleteStoredOriginal();
    return { status: 'reselect' };
  }
}

/** One claim per page load. Strict-mode remounts share the same result. */
export function claimWorkshopPendingAdd(): Promise<PendingAddClaim> {
  if (!claimCache) claimCache = claimOnce();
  return claimCache;
}
