import type { Product } from '../../data/products';

/** Legacy sample faces still used outside the 18 cards. The cards themselves do not use these. */
export const COLLECTION18_ASSETS = [
  { file: '/preview/card-a-face.jpg', mark: 'A' },
  { file: '/preview/card-b-face.jpg', mark: 'B' },
  { file: '/preview/card-c-face.jpg', mark: 'C' },
  { file: '/preview/card-d-face.jpg', mark: 'D' },
] as const;

export const COLLECTION18_BATCH = 18;

export const COLLECTION18_PRODUCTS: Product[] = Array.from({ length: COLLECTION18_BATCH }, (_, index) => {
  const n = index + 1;
  const file = `/preview/collection18/artworks/${n}.webp`;
  const label = `미리보기 ${String(n).padStart(2, '0')}`;
  return {
    id: `c18-${String(n).padStart(2, '0')}`,
    title: label,
    artist: 'METALORA',
    image: file,
    front_image: file,
    description: `자리 표시 기록. 이미지 파일 ${n}.webp. 고유 작품이 아닙니다.`,
    limited: false,
    created_at: new Date(Date.UTC(2026, 0, n, 9, 0, 0)).toISOString(),
  };
});

export function uniqueCollection18Files(): string[] {
  return [...new Set(COLLECTION18_PRODUCTS.map((product) => product.image))];
}

/** Mock rows open the matching real preview product. They are not catalog ids. */
export function collectionProductHref(product: Product): string {
  const src = product.front_image || product.image;
  const mark = ['a', 'b', 'c', 'd'].find((letter) => src.includes(`card-${letter}`));
  return mark ? `/product/sample-${mark}` : `/product/${product.id}`;
}

/** Stable shuffle. Same seed returns the same order. Adjacent files are separated when another file exists. */
export function shuffleProducts(list: Product[], seed: number): Product[] {
  const next = [...list];
  let state = seed || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  for (let i = 1; i < next.length; i += 1) {
    if (next[i].image !== next[i - 1].image) continue;
    const swap = next.findIndex(
      (item, index) => index > i && item.image !== next[i].image && item.image !== (next[i + 1]?.image ?? ''),
    );
    if (swap > i) [next[i], next[swap]] = [next[swap], next[i]];
  }
  return next;
}
