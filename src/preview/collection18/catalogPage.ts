import type { Product } from '../../data/products';
import { COLLECTION18_ASSETS, COLLECTION18_PRODUCTS } from './catalog';

/** CATALOG-API-1.0 page size. The client does not send a limit. */
export const CATALOG_PAGE_SIZE = 8;

export type CatalogSort = 'latest' | 'random';

/** Six fields the contract returns. The grid does not read anything else. */
export type CatalogGridProduct = {
  id: string;
  title: string;
  subtitle: string | null;
  front_image: string | null;
  created_at: string;
  is_limited: boolean | null;
};

export type CatalogErrorCode = 'invalid_cursor' | 'invalid_sort' | 'invalid_seed' | 'invalid_query';

export type CatalogPageSuccess = {
  ok: true;
  products: CatalogGridProduct[];
  next_cursor: string | null;
  has_more: boolean;
};

export type CatalogPageFailure = {
  ok: false;
  error: { code: CatalogErrorCode; message: string };
};

export type CatalogPageResult = CatalogPageSuccess | CatalogPageFailure;

export type CatalogPageQuery = {
  search: string;
  sort: CatalogSort;
  /** Numeric seeds from the existing preview controls are stringified. Latest ignores this. */
  seed: number | string;
  cursor: string | null;
};

/**
 * Isolated stand-in for `catalog_products_page`.
 * It does not call Supabase and does not implement the RPC.
 */
export type CatalogPageSource = {
  mode: 'preview-mock' | 'catalog-staging-rpc';
  fetchPage: (query: CatalogPageQuery) => Promise<CatalogPageResult>;
};

type FixtureRow = CatalogGridProduct & {
  is_visible: boolean | null;
};

const SEED_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MD5_K = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32));
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

function md5hex(value: string): string {
  const bytes = Array.from(new TextEncoder().encode(value));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let shift = 0; shift < 64; shift += 8) bytes.push((bitLength / 2 ** shift) & 255);
  const rot = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const k = MD5_K;
  const s = MD5_S;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const chunk = bytes.slice(offset, offset + 64);
    const words = Array.from({ length: 16 }, (_, index) => (
      chunk[index * 4] | (chunk[index * 4 + 1] << 8) | (chunk[index * 4 + 2] << 16) | (chunk[index * 4 + 3] << 24)
    ));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let fn = 0;
      let g = 0;
      if (index < 16) {
        fn = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        fn = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        fn = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        fn = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const rotated = rot((a + fn + k[index] + words[g]) | 0, s[(index >> 4) * 4 + (index % 4)]);
      const nextB = (b + rotated) | 0;
      a = d;
      d = c;
      c = b;
      b = nextB;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  const hex = (n: number) => [0, 8, 16, 24].map((shift) => ((n >>> shift) & 255).toString(16).padStart(2, '0')).join('');
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

export function catalogMd5Key(id: string, seed: string): string {
  return md5hex(`${id}:${seed}`);
}

function normalizeSearch(value: string): string {
  return value.trim();
}

function searchHaystack(row: CatalogGridProduct): string {
  return `${row.title} ${row.subtitle ?? ''}`.toLocaleLowerCase();
}

function matchesSearch(row: CatalogGridProduct, search: string): boolean {
  if (!search) return true;
  return searchHaystack(row).includes(search.toLocaleLowerCase());
}

function eligible(row: FixtureRow): boolean {
  return row.is_visible === true && typeof row.created_at === 'string' && row.created_at.length > 0;
}

function compareLatest(a: CatalogGridProduct, b: CatalogGridProduct): number {
  const byTime = b.created_at.localeCompare(a.created_at);
  if (byTime !== 0) return byTime;
  return b.id.localeCompare(a.id);
}

type CursorPayload = {
  search: string;
  sort: CatalogSort;
  seed: string;
  created_at?: string;
  md5?: string;
  id: string;
};

function encodeCursor(payload: CursorPayload): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(cursor)))) as CursorPayload;
    if (!parsed || (parsed.sort !== 'latest' && parsed.sort !== 'random') || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function failure(code: CatalogErrorCode, message: string): CatalogPageFailure {
  return { ok: false, error: { code, message } };
}

function toGrid(row: FixtureRow): CatalogGridProduct {
  return {
    id: String(row.id),
    title: row.title,
    subtitle: row.subtitle,
    front_image: row.front_image,
    created_at: row.created_at,
    is_limited: row.is_limited,
  };
}

type PreparedPage = {
  key: string;
  rows: FixtureRow[];
  randomKeys: Map<string, string> | null;
};

export function createCatalogPageSource(records: FixtureRow[]): CatalogPageSource {
  let prepared: PreparedPage | null = null;

  function prepare(search: string, sort: CatalogSort, seed: string): PreparedPage {
    const key = `${sort}\0${seed}\0${search}`;
    if (prepared?.key === key) return prepared;
    const visible = records.filter((row) => eligible(row) && matchesSearch(row, search));
    if (sort === 'random') {
      const keyed = visible.map((row) => ({ row, md5: catalogMd5Key(row.id, seed) }));
      keyed.sort((left, right) => {
        const byKey = left.md5.localeCompare(right.md5);
        if (byKey !== 0) return byKey;
        return left.row.id.localeCompare(right.row.id);
      });
      const randomKeys = new Map<string, string>();
      const rows = keyed.map((item) => {
        randomKeys.set(item.row.id, item.md5);
        return item.row;
      });
      prepared = { key, rows, randomKeys };
      return prepared;
    }
    prepared = { key, rows: [...visible].sort(compareLatest), randomKeys: null };
    return prepared;
  }

  return {
    mode: 'preview-mock',
    async fetchPage(query) {
      if (query.sort !== 'latest' && query.sort !== 'random') {
        return failure('invalid_sort', 'Sort is not supported.');
      }
      const search = normalizeSearch(query.search).slice(0, 80);
      const seed = query.sort === 'random' ? String(query.seed ?? '') : '';
      if (query.sort === 'random' && !SEED_PATTERN.test(seed)) {
        return failure('invalid_seed', 'Seed is not valid for random order.');
      }

      const ordered = prepare(search, query.sort, seed);

      let start = 0;
      if (query.cursor !== null) {
        const decoded = decodeCursor(query.cursor);
        if (!decoded || decoded.search !== search || decoded.sort !== query.sort || decoded.seed !== seed) {
          return failure('invalid_cursor', 'Cursor does not match this query.');
        }
        const index = ordered.rows.findIndex((row) => {
          if (row.id !== decoded.id) return false;
          if (query.sort === 'latest') return row.created_at === decoded.created_at;
          return ordered.randomKeys?.get(row.id) === decoded.md5;
        });
        if (index < 0) return failure('invalid_cursor', 'Cursor does not match this query.');
        start = index + 1;
      }

      const window = ordered.rows.slice(start, start + CATALOG_PAGE_SIZE + 1);
      const page = window.slice(0, CATALOG_PAGE_SIZE).map(toGrid);
      const hasMore = window.length > CATALOG_PAGE_SIZE;
      const last = page[page.length - 1];
      const nextCursor = hasMore && last
        ? encodeCursor(query.sort === 'random'
          ? { search, sort: 'random', seed, md5: ordered.randomKeys?.get(last.id) || '', id: last.id }
          : { search, sort: 'latest', seed: '', created_at: last.created_at, id: last.id })
        : null;
      return { ok: true, products: page, next_cursor: nextCursor, has_more: hasMore };
    },
  };
}

function asFixture(product: Product, visible: boolean | null = true): FixtureRow {
  return {
    id: product.id,
    title: product.title,
    subtitle: product.subtitle ?? null,
    front_image: product.front_image || product.image || null,
    created_at: product.created_at || '',
    is_limited: product.limited,
    is_visible: visible,
  };
}

export const collection18PageSource = createCatalogPageSource(
  COLLECTION18_PRODUCTS.map((product) => asFixture(product, true)),
);

/** Release storefront rows only. Fixture ids never become catalog links. */
export function catalogSourceFromStoreProducts(products: Product[]): CatalogPageSource {
  const rows = products
    .filter((product) => (
      product.is_visible !== false
      && Boolean(product.created_at)
      && !product.id.startsWith('c18-')
      && !product.id.startsWith('syn-')
    ))
    .map((product) => asFixture(product, product.is_visible !== false));
  return createCatalogPageSource(rows);
}

/** Isolated scale fixture. Not written to a database. Includes rows the contract must hide. */
export function createSyntheticCatalogSource(count = 160): CatalogPageSource {
  const rows: FixtureRow[] = [];
  for (let index = 1; index <= count; index += 1) {
    const file = COLLECTION18_ASSETS[(index - 1) % COLLECTION18_ASSETS.length].file;
    const day = Math.floor((index - 1) / 4);
    rows.push({
      id: `syn-${String(index).padStart(4, '0')}`,
      title: `합성 ${String(index).padStart(4, '0')}`,
      subtitle: index % 5 === 0 ? `부제 ${index}` : null,
      front_image: file,
      created_at: new Date(Date.UTC(2026, 0, 1 + (day % 28), 12, index % 60, index % 60)).toISOString(),
      is_limited: false,
      is_visible: true,
    });
  }
  rows.push({
    id: 'syn-hidden',
    title: '숨김 합성',
    subtitle: null,
    front_image: COLLECTION18_ASSETS[0].file,
    created_at: new Date(Date.UTC(2026, 2, 1)).toISOString(),
    is_limited: false,
    is_visible: false,
  });
  rows.push({
    id: 'syn-undated',
    title: '날짜없음 합성',
    subtitle: null,
    front_image: COLLECTION18_ASSETS[1].file,
    created_at: '',
    is_limited: false,
    is_visible: true,
  });
  return createCatalogPageSource(rows);
}
