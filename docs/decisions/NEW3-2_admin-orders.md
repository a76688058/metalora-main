# NEW3-2 — Admin order management rebuild

Status: **READY FOR FINAL NEW3-2 CHECK**

Date: 2026-10-05

Decision: `/admin/orders` is an operational queue. It uses existing order columns and the production status set only. Customer `OrdersModal` is untouched.

## Canonical statuses

Stored value → admin label:

| Stored | Label |
|---|---|
| `PAID` | 결제확인 |
| `PRODUCTION` | 제작/검수 중 |
| `SHIPPING` | 배송 중 |
| `COMPLETED` | 배송완료 |

No new statuses. No refund/cancel/return UI.

## Search

View-only. Fields: `order_number`, `shipping_name`, `shipping_phone`, `tracking_number`. Email is not searched.

## Filters

- Status: 전체 + the four canonical statuses.
- Date (`created_at`): 전체 / 오늘 / 최근 7일 / 최근 30일. No custom range.

## Status mutation

Canonical lifecycle only:

`PAID` → `PRODUCTION` → `SHIPPING` → `COMPLETED`

- No skips. No reverse transitions. `COMPLETED` is terminal.
- Same-status is a no-op.
- Unknown/non-canonical stored status is read-only (`알 수 없는 상태`); no mutation.
- No one-click status write. Confirm dialog shows current → next.
- `PRODUCTION` → `SHIPPING` requires courier + tracking number before the write.
- Writes only `status` / `courier` / `tracking_number` on `orders`. No shipment notification is sent.
- Cancellation / refund / return are not part of NEW3-2.

## Detail panel action order

- `PAID`: current / next state + `제작/검수 시작`. No shipping inputs.
- `PRODUCTION`: current / next state, then courier + tracking inputs, then `배송 시작`. Required inputs render before the action that depends on them.
- `SHIPPING`: current shipping info; tracking remains editable via existing tracking save; `배송완료 처리` is the next-state action.
- `COMPLETED`: terminal / read-only for status. Tracking save remains available. No status transition CTA.

Confirming `PRODUCTION` → `SHIPPING` does not reset the tracking draft, so typed courier/tracking survive into the confirm dialog.

## Tracking

Courier and tracking number can be saved separately, with confirmation, without changing status. After `SHIPPING` or `COMPLETED`, tracking may still be corrected. Failure shows an error. Copy does not claim a dispatch notice.

## Images

No `picsum.photos`. Missing/broken images show a neutral `이미지 없음` placeholder.

## Pagination

Implemented. Page size 25 via PostgREST `range` + `count: exact`. Previous/next. No infinite scroll.

## Do Not Do

- Do not edit `src/components/OrdersModal.tsx` or other preserved WIP.
- Do not change order schema.
- Do not deploy / commit from this ticket.
