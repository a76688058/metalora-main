import type { CatalogSort } from './collection18/catalogPage';

/** Existing parent sort/search handlers. Not a second catalog state. */
export type CatalogControlBridge = {
  sort: CatalogSort;
  onSort: (mode: CatalogSort) => void;
  search: string;
  onSearch: (value: string, commit: boolean) => void;
  onClear: () => void;
  disabled: boolean;
};

let bridge: CatalogControlBridge | null = null;

export function bindCatalogControls(next: CatalogControlBridge) {
  bridge = next;
}

export function readCatalogControls() {
  return bridge;
}
