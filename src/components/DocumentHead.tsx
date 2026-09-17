import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import type { Product } from '../data/products';
import { getFullImageUrl } from '../lib/utils';

const SEO_ORIGIN = 'https://metalora.art';
const ORG_LOGO_URL = `${SEO_ORIGIN}/logo/metalora-wordmark.webp`;
const DEFAULT_OG_IMAGE =
  'https://postfiles.pstatic.net/MjAyNjA0MjNfMjkx/MDAxNzc2OTMwMjQ2MTE5.UFl10atOBM5XVpMDDx2TKIb_0KMZda8VbKvbqrldr20g.xboRY7lXJwS-i6KDuIpCB44DJbbikiOOHXoaOHvjPgcg.PNG/thumbnail.og2.png?type=w966';
const JSON_LD_MARKER = 'metalora-document-head';

const HOME_TITLE = '메탈로라 | 프리미엄 커스텀 메탈 액자';
const HOME_DESCRIPTION =
  '못 없이 설치하는 마그네틱 메탈 액자. 알루미늄에 이미지를 승화전사한 인테리어 메탈 아트로 공간에 포인트를 더해보세요.';

const POLICY_TITLES: Record<string, string> = {
  terms: '이용약관 | 메탈로라',
  refund: '환불정책 | 메탈로라',
  privacy: '개인정보 처리방침 | 메탈로라',
  cookie: '쿠키 정책 | 메탈로라',
  agreement: '제작동의서 | 메탈로라',
};
const POLICY_DESCRIPTION = '메탈로라 서비스 정책.';

const FUNCTIONAL_TITLES: Record<string, string> = {
  '/login': '로그인 | 메탈로라',
  '/auth/callback': '인증 | 메탈로라',
  '/profile/complete': '프로필 | 메탈로라',
  '/payment/success': '결제 완료 | 메탈로라',
  '/payment/fail': '결제 | 메탈로라',
  '/admin': '관리자 | 메탈로라',
  '/admin/login': '관리자 로그인 | 메탈로라',
  '/admin/products': '관리자 | 메탈로라',
  '/admin/orders': '관리자 | 메탈로라',
  '/admin/cs': '관리자 | 메탈로라',
  '/admin/users': '관리자 | 메탈로라',
  '/admin/best-sellers': '관리자 | 메탈로라',
  '/admin/banners': '관리자 | 메탈로라',
};

const FUNCTIONAL_DESCRIPTION = '메탈로라 서비스 페이지입니다.';
const NOINDEX = 'noindex, nofollow';

type HeadPayload = {
  title: string;
  description: string;
  canonicalPath: string;
  ogType: string;
  ogImage: string;
  robots: string | null;
  jsonLd: Record<string, unknown>[];
};

function stripTrailingSlashes(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const stripped = pathname.replace(/\/+$/, '');
  return stripped.length > 0 ? stripped : '/';
}

function canonicalUrl(path: string): string {
  return path === '/' ? `${SEO_ORIGIN}/` : `${SEO_ORIGIN}${path}`;
}

function isPublicProduct(product: Product | undefined): product is Product {
  return !!product && product.is_visible !== false;
}

function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'METALORA',
    url: SEO_ORIGIN,
    logo: ORG_LOGO_URL,
    sameAs: [
      'https://www.instagram.com/metalora_official',
      'https://www.facebook.com/metalora',
    ],
  };
}

function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'METALORA',
    url: `${SEO_ORIGIN}/`,
  };
}

function productOffer(product: Product): { price: number | null; availability: string } {
  const options = Array.isArray(product.options) ? product.options : [];
  const inStock = options.some(
    (opt) => opt && opt.isActive && typeof opt.stock === 'number' && opt.stock > 0,
  );
  const priced =
    options.find((opt) => opt && opt.isActive && typeof opt.stock === 'number' && opt.stock > 0) ||
    options.find((opt) => opt && typeof opt.price === 'number') ||
    options[0];
  const price =
    priced && typeof priced.price === 'number' && Number.isFinite(priced.price) ? priced.price : null;
  return {
    price,
    availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  };
}

function resolveOgImage(pathOrUrl: string | null | undefined): string {
  return getFullImageUrl(pathOrUrl) || DEFAULT_OG_IMAGE;
}

function homePayload(): HeadPayload {
  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    canonicalPath: '/',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: null,
    jsonLd: [organizationJsonLd(), websiteJsonLd()],
  };
}

function productPayload(product: Product): HeadPayload {
  const canonicalPath = `/product/${product.id}`;
  const url = canonicalUrl(canonicalPath);
  const description = (product.description && product.description.trim()) || product.title;
  const imageUrl = resolveOgImage(product.front_image || product.image);
  const { price, availability } = productOffer(product);

  return {
    title: `${product.title} | 메탈로라`,
    description,
    canonicalPath,
    ogType: 'product',
    ogImage: imageUrl,
    robots: null,
    jsonLd: [
      organizationJsonLd(),
      {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.title,
        image: [imageUrl],
        description,
        url,
        offers: {
          '@type': 'Offer',
          url,
          priceCurrency: 'KRW',
          ...(price != null ? { price } : {}),
          availability,
        },
      },
      {
        '@context': 'https://schema.org/',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SEO_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: product.title, item: url },
        ],
      },
    ],
  };
}

function missingProductPayload(productId: string): HeadPayload {
  return {
    title: '상품을 찾을 수 없습니다 | 메탈로라',
    description: '요청하신 상품을 찾을 수 없거나 현재 공개되지 않습니다.',
    canonicalPath: `/product/${productId}`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: NOINDEX,
    jsonLd: [organizationJsonLd()],
  };
}

function policyPayload(type: string): HeadPayload {
  return {
    title: POLICY_TITLES[type] || '정책 | 메탈로라',
    description: POLICY_DESCRIPTION,
    canonicalPath: `/policy/${type}`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: null,
    jsonLd: [organizationJsonLd()],
  };
}

function functionalPayload(path: string): HeadPayload {
  return {
    title: FUNCTIONAL_TITLES[path] || '메탈로라',
    description: FUNCTIONAL_DESCRIPTION,
    canonicalPath: path,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: NOINDEX,
    jsonLd: [],
  };
}

function unknownPayload(path: string): HeadPayload {
  return {
    title: '페이지를 찾을 수 없습니다 | 메탈로라',
    description: '요청하신 페이지를 찾을 수 없습니다.',
    canonicalPath: path,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: NOINDEX,
    jsonLd: [organizationJsonLd()],
  };
}

function currentCanonicalHref(): string | null {
  const el = document.querySelector('link[rel="canonical"]');
  return el instanceof HTMLLinkElement ? el.href : null;
}

function upsertMetaByName(name: string, content: string) {
  const nodes = [...document.head.querySelectorAll(`meta[name="${name}"]`)];
  const first = nodes[0];
  for (let i = 1; i < nodes.length; i += 1) nodes[i].remove();
  if (first) {
    first.setAttribute('content', content);
    return;
  }
  const meta = document.createElement('meta');
  meta.setAttribute('name', name);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

function removeMetaByName(name: string) {
  document.head.querySelectorAll(`meta[name="${name}"]`).forEach((node) => node.remove());
}

function upsertMetaByProperty(property: string, content: string) {
  const nodes = [...document.head.querySelectorAll(`meta[property="${property}"]`)];
  const first = nodes[0];
  for (let i = 1; i < nodes.length; i += 1) nodes[i].remove();
  if (first) {
    first.setAttribute('content', content);
    return;
  }
  const meta = document.createElement('meta');
  meta.setAttribute('property', property);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

function upsertCanonical(href: string) {
  const nodes = [...document.head.querySelectorAll('link[rel="canonical"]')];
  const first = nodes[0];
  for (let i = 1; i < nodes.length; i += 1) nodes[i].remove();
  if (first instanceof HTMLLinkElement) {
    first.href = href;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'canonical';
  link.href = href;
  document.head.appendChild(link);
}

function replaceJsonLd(blocks: Record<string, unknown>[]) {
  document.head
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((node) => node.remove());

  for (const block of blocks) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(`data-${JSON_LD_MARKER}`, '1');
    script.textContent = JSON.stringify(block)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
    document.head.appendChild(script);
  }
}

function applyHead(payload: HeadPayload) {
  const url = canonicalUrl(payload.canonicalPath);
  document.title = payload.title;
  upsertMetaByName('description', payload.description);
  upsertCanonical(url);

  if (payload.robots) {
    upsertMetaByName('robots', payload.robots);
  } else {
    removeMetaByName('robots');
  }

  upsertMetaByProperty('og:title', payload.title);
  upsertMetaByProperty('og:description', payload.description);
  upsertMetaByProperty('og:url', url);
  upsertMetaByProperty('og:type', payload.ogType);
  upsertMetaByProperty('og:image', payload.ogImage);
  upsertMetaByName('twitter:title', payload.title);
  upsertMetaByName('twitter:description', payload.description);
  upsertMetaByName('twitter:image', payload.ogImage);
  replaceJsonLd(payload.jsonLd);
}

/**
 * Route-aware client head sync. Server HTML stays authoritative for the first
 * paint; this updates/replaces existing tags after SPA navigation.
 */
export default function DocumentHead() {
  const { pathname } = useLocation();
  const { products, isLoading, isError } = useProducts();
  const sawCatalogLoading = useRef(false);

  if (isLoading) {
    sawCatalogLoading.current = true;
  }

  const catalogSettled = products.length > 0 || (sawCatalogLoading.current && !isLoading);

  useLayoutEffect(() => {
    const path = stripTrailingSlashes(pathname);

    if (path === '/') {
      applyHead(homePayload());
      return;
    }

    if (Object.prototype.hasOwnProperty.call(FUNCTIONAL_TITLES, path)) {
      applyHead(functionalPayload(path));
      return;
    }

    const policyMatch = path.match(/^\/policy\/([^/]+)$/);
    if (policyMatch) {
      const type = policyMatch[1];
      if (POLICY_TITLES[type]) {
        applyHead(policyPayload(type));
        return;
      }
      applyHead(unknownPayload(path));
      return;
    }

    const productMatch = path.match(/^\/product\/([^/]+)$/);
    if (productMatch) {
      const productId = decodeURIComponent(productMatch[1]);
      const listed = products.find((item) => item.id === productId);

      if (isPublicProduct(listed)) {
        applyHead(productPayload(listed));
        return;
      }

      if (listed) {
        applyHead(missingProductPayload(productId));
        return;
      }

      if (isError) {
        return;
      }

      if (!catalogSettled || isLoading) {
        return;
      }

      const existing = currentCanonicalHref();
      const thisUrl = canonicalUrl(`/product/${productId}`);
      if (existing === thisUrl) {
        return;
      }

      applyHead(missingProductPayload(productId));
      return;
    }

    applyHead(unknownPayload(path));
  }, [pathname, products, isLoading, isError, catalogSettled]);

  return null;
}
