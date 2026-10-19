/**
 * Server-only Toss full-cancel adapter.
 * POST /v1/payments/{paymentKey}/cancel with cancelReason and Idempotency-Key.
 * cancelAmount is omitted so Toss treats the call as a full cancellation.
 * Lookup reuses GET /v1/payments/orders/{orderId}. This module does not run at import.
 */

export type TossCancelCallResult =
  | { ok: true; payment: unknown }
  | { ok: false; kind: 'rejected'; code: string | null }
  | { ok: false; kind: 'timeout' | 'network' | 'invalid_body' };

export function fullCancelRequestBody(cancelReason: string): { cancelReason: string } {
  return { cancelReason };
}

function basicAuth(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

function providerCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const code = (body as { code?: unknown }).code;
  if (typeof code !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(code)) return null;
  return code;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function postTossFullCancel(
  fetchImpl: typeof fetch,
  secretKey: string,
  input: { paymentKey: string; cancelReason: string; idempotencyKey: string },
): Promise<TossCancelCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: basicAuth(secretKey),
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify(fullCancelRequestBody(input.cancelReason)),
      },
    );
    const body = await readJson(response);
    if (!response.ok) {
      return { ok: false, kind: 'rejected', code: providerCode(body) };
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, kind: 'invalid_body' };
    }
    return { ok: true, payment: body };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout' };
    }
    return { ok: false, kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupTossPayment(
  fetchImpl: typeof fetch,
  secretKey: string,
  orderNumber: string,
): Promise<
  | { ok: true; payment: unknown }
  | { ok: false; kind: 'not_found' | 'rejected' | 'timeout' | 'network' | 'invalid_body' }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(
      `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderNumber)}`,
      {
        method: 'GET',
        signal: controller.signal,
        headers: { Authorization: basicAuth(secretKey) },
      },
    );
    const body = await readJson(response);
    if (response.status === 404) return { ok: false, kind: 'not_found' };
    if (!response.ok) return { ok: false, kind: 'rejected' };
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, kind: 'invalid_body' };
    }
    return { ok: true, payment: body };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout' };
    }
    return { ok: false, kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
