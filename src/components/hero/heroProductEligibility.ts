import type { Product } from '../../data/products';

/** Products eligible for Hero artwork — visible, image, purchasable */
export function getEligibleHeroProducts(products: Product[]): Product[] {
  return products.filter((p) => {
    if (p.is_visible === false) return false;
    if (!p.id) return false;

    const imagePath = p.front_image || p.image;
    if (!imagePath || imagePath.trim() === '') return false;

    const options = p.options ?? [];
    if (options.length === 0) return false;

    const purchasable = options.some((o) => o.isActive !== false && o.stock > 0);
    return purchasable;
  });
}

export function resolveHeroOrientation(product: Product): 'portrait' | 'landscape' {
  const supported = product.supported_orientations;
  if (supported?.length === 1 && supported[0] === 'landscape') return 'landscape';
  if (supported?.includes('landscape') && !supported.includes('portrait')) return 'landscape';
  return 'portrait';
}

export function resolveHeroImagePath(product: Product, orientation: 'portrait' | 'landscape'): string {
  if (orientation === 'landscape') {
    return product.landscape_image || product.front_image || product.image || '';
  }
  return product.front_image || product.image || '';
}

export function resolveHeroPrice(product: Product): number {
  const active = product.options?.find((o) => o.isActive !== false && o.stock > 0);
  return active?.price ?? product.options?.[0]?.price ?? product.price ?? 0;
}
