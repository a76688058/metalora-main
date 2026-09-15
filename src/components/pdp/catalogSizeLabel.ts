/** Current confirmed general-catalog finished size is M only. */

export const CATALOG_M_NAME = 'M';
export const CATALOG_M_DIMENSION = '200 × 283 mm';
export const CATALOG_M_SIZE_LABEL = 'M · 200 × 283 mm';

function dimensionNumbers(dimension: string): number[] {
  return [...dimension.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
}

function pairMatches(
  a: number,
  b: number,
  x: number,
  y: number,
  tolerance: number,
): boolean {
  return (
    (Math.abs(a - x) <= tolerance && Math.abs(b - y) <= tolerance) ||
    (Math.abs(a - y) <= tolerance && Math.abs(b - x) <= tolerance)
  );
}

/** A4 leftovers and the confirmed M panel share one customer-facing size. */
export function isCurrentCatalogM(name: string, dimension: string): boolean {
  const n = name.trim().toLowerCase();
  if (n === 'a4' || n === 'm' || n === 'metalora m') return true;
  const nums = dimensionNumbers(dimension);
  if (nums.length < 2) return false;
  const [first, second] = nums;
  if (pairMatches(first, second, 21, 29.7, 0.2)) return true;
  if (pairMatches(first, second, 210, 297, 1)) return true;
  if (pairMatches(first, second, 200, 283, 1)) return true;
  return false;
}

export function catalogOptionName(name: string, dimension: string): string {
  return isCurrentCatalogM(name, dimension) ? CATALOG_M_NAME : name;
}

export function catalogOptionDimension(name: string, dimension: string): string {
  if (isCurrentCatalogM(name, dimension)) return CATALOG_M_DIMENSION;
  return dimension;
}

export function catalogSizeCaption(name: string, dimension: string): string {
  if (isCurrentCatalogM(name, dimension)) return CATALOG_M_SIZE_LABEL;
  if (name && dimension) return `${name} · ${dimension}`;
  return name || dimension;
}
