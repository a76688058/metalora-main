import { supabase } from '../supabase';

export const CUSTOM_M_PRICE_KEY = 'custom_m_price';
export const PRICE_UNAVAILABLE_MESSAGE = '판매가를 확인할 수 없습니다.';

export function parsePositiveKrwInteger(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw < 1) return null;
    return raw;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

export function formatCustomMPrice(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}

/** Live display authority only. Not a trusted cart stamp. */
export async function fetchCustomMPrice(): Promise<number | null> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', CUSTOM_M_PRICE_KEY)
    .maybeSingle();

  if (error || !data) return null;
  return parsePositiveKrwInteger(data.value);
}
