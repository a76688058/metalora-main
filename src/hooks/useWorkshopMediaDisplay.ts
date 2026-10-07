import { useEffect, useReducer, useRef } from 'react';
import {
  isCanonicalWorkshopRef,
  isLegacyWorkshopRef,
  resolveWorkshopMedia,
  retryWorkshopMediaAfterLoadError,
  type WorkshopMediaMode,
} from '../lib/workshopMedia';
import {
  canonicalWorkshopRefs,
  createWorkshopMediaDisplay,
  type WorkshopDisplayApi,
  type WorkshopMediaDisplay,
} from '../lib/workshopMediaDisplay';

export const workshopDisplayApi: WorkshopDisplayApi = {
  isCanonical: isCanonicalWorkshopRef,
  isLegacy: isLegacyWorkshopRef,
  resolve: resolveWorkshopMedia,
  retryAfterLoadError: retryWorkshopMediaAfterLoadError,
};

/**
 * Temporary display srcs for the Workshop refs currently on screen. Pass durable values only;
 * the returned srcs are for <img src> and must not be stored, logged or navigated to.
 */
export function useWorkshopMediaDisplay(values: readonly unknown[], mode: WorkshopMediaMode): WorkshopMediaDisplay {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const displayRef = useRef<WorkshopMediaDisplay | null>(null);
  if (!displayRef.current) displayRef.current = createWorkshopMediaDisplay(workshopDisplayApi, mode, rerender);
  const display = displayRef.current;
  const key = canonicalWorkshopRefs(values, workshopDisplayApi).join('\n');

  useEffect(() => {
    void display.setRefs(key ? key.split('\n') : []);
  }, [display, key]);

  useEffect(() => () => display.dispose(), [display]);

  return display;
}
