import { getFullImageUrl } from '../../lib/utils';
import { workshopOrderItemThumbRef, type WorkshopDisplayApi } from '../../lib/workshopMediaDisplay';

export type AdminOrderItem = {
  title: string;
  option: string;
  quantity: number;
  price: number | null;
  /** Catalog: public image URL. Workshop: durable ref (canonical path or legacy URL) for the resolver. */
  imageUrl: string | null;
  orientation: string | null;
  isWorkshop: boolean;
  customConfig: Record<string, unknown> | null;
  originalRef: string | null;
  lineId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function nonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Purchased unit price already stored on the order.
 * The line `price` is the unit the server multiplied by quantity.
 * A missing line price can use custom_config only when `price` and
 * `price_snapshot` are the same stored non-negative integer.
 * Current catalog prices are never consulted.
 */
export function readStoredPurchasedUnitPrice(itemPrice: unknown, config: unknown): number | null {
  if (itemPrice != null && itemPrice !== '') return nonNegativeInt(itemPrice);
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const stored = config as Record<string, unknown>;
  const snapshot = nonNegativeInt(stored.price_snapshot);
  const stamped = nonNegativeInt(stored.price);
  if (snapshot == null || stamped == null || snapshot !== stamped) return null;
  return snapshot;
}

/** Line amount from the stored unit and stored quantity. Not an order total. */
export function storedCustomLineAmount(unitPrice: number | null, quantity: number): number | null {
  if (unitPrice == null || !Number.isSafeInteger(quantity) || quantity < 1) return null;
  const line = unitPrice * quantity;
  return Number.isSafeInteger(line) ? line : null;
}

/** Original pixel size stored on the order. Both axes are required. */
export function readStoredSourcePixels(config: unknown): { width: number; height: number } | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const stored = config as Record<string, unknown>;
  const width = positiveFinite(stored.source_width);
  const height = positiveFinite(stored.source_height);
  if (width == null || height == null) return null;
  return { width, height };
}

export function mapAdminOrderItem(raw: unknown, api: WorkshopDisplayApi): AdminOrderItem {
  const item = asRecord(raw);
  const productId = asString(item.product_id);
  const isWorkshop = productId === 'workshop-single' || productId === '' || item.product_id == null;
  const config = asRecord(item.custom_config);
  const imagePath = isWorkshop
    ? workshopOrderItemThumbRef(item, api)
    : asString(item.image) ||
      asString(item.user_image_url) ||
      asString(item.front_image) ||
      asString(item.custom_image) ||
      asString(item.preview_url) ||
      '';
  const original = asString(config.original_image_url).trim();
  return {
    title: asString(item.title) || asString(item.product_title) || asString(item.name) || '제품',
    option: asString(item.option) || asString(item.selected_option) || '',
    quantity: asNumber(item.quantity) ?? 0,
    price: asNumber(item.price),
    imageUrl: isWorkshop ? imagePath || null : imagePath ? getFullImageUrl(imagePath) : null,
    orientation: asString(item.orientation) || null,
    isWorkshop,
    customConfig: isWorkshop && Object.keys(config).length > 0 ? config : null,
    originalRef: isWorkshop && original ? original : null,
    lineId: asString(item.id) || asString(item.line_id) || null,
  };
}
