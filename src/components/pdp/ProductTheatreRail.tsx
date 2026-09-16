import React from 'react';
import { ArrowLeft, Check, Minus, Plus } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import type { Product } from '../../data/products';
import { catalogOptionDimension, catalogOptionName } from './catalogSizeLabel';

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

interface ProductTheatreRailProps {
  product: Product;
  isWorkshopReturn: boolean;
  selectedOptionId: string;
  selectedOrientation: 'portrait' | 'landscape';
  quantity: number;
  currentPrice: number;
  isSoldOut: boolean;
  isAddingToCart: boolean;
  isAdded: boolean;
  errorMsg: string;
  onBack: () => void;
  onSelectOption: (optionId: string) => void;
  onSelectOrientation: (orientation: 'portrait' | 'landscape') => void;
  onQuantityChange: (quantity: number) => void;
  onAddToCart: () => void;
  onOpenCart: () => void;
}

function formatOptionDimension(dimension: string, orientation: 'portrait' | 'landscape'): string {
  const dim = dimension || '';
  if (!dim) return '';
  if (!dim.toLowerCase().includes('x')) return dim;
  const parts = dim.toLowerCase().split('x');
  if (parts.length !== 2) return dim;
  const first = parts[0].replace(/cm/g, '').trim();
  const second = parts[1].replace(/cm/g, '').trim();
  if (orientation === 'landscape') {
    return `${second} × ${first} cm`;
  }
  return `${first} × ${second} cm`;
}

function catalogDimensionLine(
  name: string,
  dimension: string,
  orientation: 'portrait' | 'landscape',
): string {
  const mapped = catalogOptionDimension(name, dimension);
  if (mapped !== dimension) return mapped;
  return formatOptionDimension(dimension, orientation);
}

function isNewProduct(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < NEW_WINDOW_MS;
}

function orientationLabel(orientation: 'portrait' | 'landscape'): string {
  return orientation === 'landscape' ? '가로' : '세로';
}

export function ProductTheatreRail({
  product,
  isWorkshopReturn,
  selectedOptionId,
  selectedOrientation,
  quantity,
  currentPrice,
  isSoldOut,
  isAddingToCart,
  isAdded,
  errorMsg,
  onBack,
  onSelectOption,
  onSelectOrientation,
  onQuantityChange,
  onAddToCart,
  onOpenCart,
}: ProductTheatreRailProps) {
  const supportedOrientations: Array<'portrait' | 'landscape'> = product.supported_orientations?.length
    ? product.supported_orientations
    : ['portrait'];
  const showOrientation = supportedOrientations.length > 1;
  const breed = product.subtitle || product.artist;
  const options = product.options ?? [];
  const selectedOption = options.find((opt) => opt.id === selectedOptionId);
  const distinctPrices = new Set(options.filter((opt) => opt.isActive).map((opt) => opt.price));
  const showOptionPrice = distinctPrices.size > 1;
  const showNew = isNewProduct(product.created_at);
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;

  const setQuantity = (next: number) => {
    onQuantityChange(Math.max(1, Math.floor(next)));
  };

  return (
    <div className="flex flex-col gap-5 px-5 py-6 min-[1100px]:px-6 min-[1100px]:py-7">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring inline-flex w-fit items-center gap-2 type-metadata text-text-secondary hover:text-text-primary"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        작품 목록
      </button>

      {(product.limited || showNew) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {product.limited ? <Badge variant="limited">한정판</Badge> : null}
          {showNew ? <Badge variant="new">신상품</Badge> : null}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h1 className="type-product-title text-text-primary">{product.title}</h1>
        {breed ? <p className="type-supporting text-text-secondary">{breed}</p> : null}
        <p
          className="mt-2 type-section-title text-text-primary"
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          ₩{currentPrice.toLocaleString()}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="type-metadata text-text-secondary">크기</h2>
        {options.length > 0 ? (
          <div className="flex flex-col">
            {options.map((option) => {
              const unavailable = !option.isActive || option.stock <= 0;
              const selected = selectedOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectOption(option.id)}
                  disabled={unavailable}
                  aria-pressed={selected}
                  className={cn(
                    'focus-ring flex w-full items-baseline justify-between gap-3 border-b py-2.5 text-left',
                    selected
                      ? 'border-text-primary text-text-primary'
                      : unavailable
                        ? 'cursor-not-allowed border-border-subtle text-disabled'
                        : 'border-border-subtle text-text-secondary hover:text-text-primary',
                  )}
                  style={{ transitionDuration: 'var(--duration-fast)' }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="type-supporting">{catalogOptionName(option.name, option.dimension)}</span>
                    <span className="type-metadata text-text-tertiary">
                      {catalogDimensionLine(option.name, option.dimension, selectedOrientation)}
                    </span>
                  </span>
                  <span className="shrink-0 type-metadata">
                    {unavailable ? '품절' : showOptionPrice ? `₩${option.price.toLocaleString()}` : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="type-supporting text-text-secondary">등록된 옵션이 없습니다.</p>
        )}
      </div>

      {showOrientation ? (
        <div className="flex flex-col gap-1.5">
          <h2 className="type-metadata text-text-secondary">방향</h2>
          <div className="flex gap-4">
            {supportedOrientations.map((orientation) => {
              const selected = selectedOrientation === orientation;
              return (
                <button
                  key={orientation}
                  type="button"
                  onClick={() => onSelectOrientation(orientation)}
                  aria-pressed={selected}
                  className={cn(
                    'focus-ring type-supporting',
                    selected ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
                  )}
                  style={{ transitionDuration: 'var(--duration-fast)' }}
                >
                  {orientationLabel(orientation)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isWorkshopReturn ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-metadata text-text-secondary" id="pdp-quantity-label">
            수량
          </h2>
          <div className="flex items-center">
            <button
              type="button"
              className="focus-ring inline-flex size-11 items-center justify-center text-text-secondary hover:text-text-primary disabled:text-disabled"
              aria-label="수량 줄이기"
              disabled={safeQuantity <= 1 || isAddingToCart || isAdded}
              onClick={() => setQuantity(safeQuantity - 1)}
            >
              <Minus size={14} strokeWidth={1.5} />
            </button>
            <span className="min-w-8 text-center type-supporting text-text-primary" aria-labelledby="pdp-quantity-label" aria-live="polite">
              {safeQuantity}
            </span>
            <button
              type="button"
              className="focus-ring inline-flex size-11 items-center justify-center text-text-secondary hover:text-text-primary disabled:text-disabled"
              aria-label="수량 늘리기"
              disabled={isAddingToCart || isAdded}
              onClick={() => setQuantity(safeQuantity + 1)}
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-t border-border-subtle pt-4">
        <p className="type-metadata text-text-secondary">
          {[
            selectedOption
              ? catalogOptionName(selectedOption.name, selectedOption.dimension)
              : undefined,
            orientationLabel(selectedOrientation),
            `₩${currentPrice.toLocaleString()}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {!isWorkshopReturn ? (
          <p className="mt-0.5 type-metadata text-text-tertiary">수량 {safeQuantity}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {errorMsg ? <p className="type-supporting text-error">{errorMsg}</p> : null}
        {isWorkshopReturn ? (
          <Button fullWidth onClick={onOpenCart}>
            내 컬렉션으로
          </Button>
        ) : (
          <Button
            fullWidth
            onClick={onAddToCart}
            disabled={isSoldOut || isAddingToCart || isAdded}
            loading={isAddingToCart}
          >
            {isAddingToCart
              ? '컬렉션에 담는 중...'
              : isAdded
                ? (
                    <span className="inline-flex items-center gap-2">
                      <Check size={16} strokeWidth={1.5} />
                      컬렉션에 담겼습니다
                    </span>
                  )
                : isSoldOut
                  ? '품절'
                  : '내 컬렉션에 담기'}
          </Button>
        )}

        <p className="type-metadata text-text-secondary">
          2–5 영업일 제작 · 출고 후 1–3 영업일
        </p>

        <div className="border-t border-border-subtle">
          <details>
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between py-3 type-metadata text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
              제작 · 배송 안내
              <span aria-hidden className="text-text-tertiary">
                ▾
              </span>
            </summary>
            <div className="space-y-2 pb-3 type-metadata text-text-secondary">
              <p>
                <span className="text-text-primary">제작 및 검수.</span> 결제 완료 후 제작에 2–5 영업일이
                소요됩니다.
              </p>
              <p>
                <span className="text-text-primary">배송 안내.</span> 출고 후 1–3 영업일입니다. 제주·도서산간
                지역은 추가 배송비가 발생할 수 있습니다.
              </p>
              <p>
                <span className="text-text-primary">반품 안내.</span> 단순 변심에 의한 반품은 수령 후 7일 이내
                가능하며, 반품 배송비는 구매자 부담입니다.
              </p>
            </div>
          </details>

          <details>
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between py-3 type-metadata text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
              제품 안내
              <span aria-hidden className="text-text-tertiary">
                ▾
              </span>
            </summary>
            <div className="space-y-2 pb-3 type-metadata text-text-secondary">
              <p>1.15 mm 알루미늄 패널에 이미지를 전사합니다.</p>
              <p>이미지의 색감과 디테일을 표현합니다.</p>
              <p>못 없이 설치하는 마그네틱 마운트.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
