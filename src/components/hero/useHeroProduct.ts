import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useProducts } from '../../context/ProductContext';
import { getFullImageUrl } from '../../lib/utils';
import type { Product } from '../../data/products';
import {
  getEligibleHeroProducts,
  resolveHeroImagePath,
  resolveHeroOrientation,
  resolveHeroPrice,
} from './heroProductEligibility';

const SESSION_KEY = 'metalora:hero-product-id';

export interface HeroProductSelection {
  product: Product;
  frontTextureUrl: string;
  orientation: 'portrait' | 'landscape';
  price: number;
  pdpPath: string;
}

function preloadHeroTexture(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (texture) => {
        texture.dispose();
        resolve(true);
      },
      undefined,
      () => resolve(false),
    );
  });
}

/**
 * Session-stable hero product — chosen once per browser session, not on render/rerender.
 */
export function useHeroProduct(): {
  selection: HeroProductSelection | null;
  isReady: boolean;
  textureReady: boolean;
  eligibleCount: number;
} {
  const { products, isLoading } = useProducts();
  const [sessionProductId, setSessionProductId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });
  const [textureReady, setTextureReady] = useState(false);

  const eligible = useMemo(() => getEligibleHeroProducts(products), [products]);

  useEffect(() => {
    if (isLoading || eligible.length === 0) return;

    const storedValid =
      sessionProductId && eligible.some((p) => p.id === sessionProductId);

    if (storedValid) return;

    const idx = Math.floor(Math.random() * eligible.length);
    const picked = eligible[idx].id;

    try {
      sessionStorage.setItem(SESSION_KEY, picked);
    } catch {
      /* sessionStorage unavailable */
    }
    setSessionProductId(picked);
  }, [isLoading, eligible, sessionProductId]);

  const selection = useMemo((): HeroProductSelection | null => {
    if (eligible.length === 0) return null;

    const id =
      sessionProductId && eligible.some((p) => p.id === sessionProductId)
        ? sessionProductId
        : eligible[0]?.id;

    const product = eligible.find((p) => p.id === id);
    if (!product) return null;

    const orientation = resolveHeroOrientation(product);
    const imagePath = resolveHeroImagePath(product, orientation);
    const frontTextureUrl = getFullImageUrl(imagePath);
    if (!frontTextureUrl) return null;

    return {
      product,
      frontTextureUrl,
      orientation,
      price: resolveHeroPrice(product),
      pdpPath: `/product/${product.id}`,
    };
  }, [eligible, sessionProductId]);

  useEffect(() => {
    setTextureReady(false);
    if (!selection?.frontTextureUrl) return;

    let alive = true;
    preloadHeroTexture(selection.frontTextureUrl).then((ok) => {
      if (alive) setTextureReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [selection?.frontTextureUrl]);

  return {
    selection,
    isReady: !isLoading && selection !== null,
    textureReady,
    eligibleCount: eligible.length,
  };
}
