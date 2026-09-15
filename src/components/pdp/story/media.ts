import { getFullImageUrl } from '../../../lib/utils';
import type { Product } from '../../../data/products';

function isRealAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('picsum.photos')) return false;
  return true;
}

/** Same front eligibility as Theatre. Never uses back_image. */
export function resolveStoryFrontUrl(
  product: Product,
  orientation: 'portrait' | 'landscape',
): string | null {
  const raw =
    orientation === 'landscape' && product.landscape_image
      ? product.landscape_image
      : product.front_image || product.image;
  const url = getFullImageUrl(raw);
  return isRealAssetUrl(url) ? url : null;
}
