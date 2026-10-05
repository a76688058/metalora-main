# NEW3-8 — Admin best sellers report cleanup

Status: **READY FOR NEW3-8 QA**

Date: 2026-10-05

Decision: `/admin/best-sellers` remains a **read-only sales report**. It does not write rankings, does not touch `products.display_order`, and does not change storefront catalog order.

## Paid status set

Only:

`PAID` · `PRODUCTION` · `SHIPPING` · `COMPLETED`

Same NEW3-2 / NEW3-6 contract. Korean/lowercase aliases are not included. Failed / cancelled / unpaid / unknown statuses are excluded.

## Paging

Orders are read with explicit pages of 1000:

- select `id, created_at, ordered_items` only
- `.order('created_at').order('id').range(from, to)`
- continue until a short page
- hitting 100 pages is an **error**, not a partial ranking

## Error vs empty

Displayed ranking is shown only when `loadState === 'ready'` and the loaded query key matches the selected period (including applied custom dates).

- period A success → period B failure: A’s ranking is not kept under B
- loading: skeletons, not previous totals
- query failure: error + 다시 시도
- success with zero aggregatable line items: 판매 데이터가 없습니다

Latest-request-wins `requestGenRef`. Retry uses the current period/query. Unmount invalidates late writes. Fetch always increments generation and can resolve `ready` / `error` (no loading deadlock).

## Custom dates

`alert()` removed. Start and end are required; start must be `<=` end. Invalid input shows an inline Korean message and **does not query**. Custom range is applied as `YYYY-MM-DD` KST day bounds.

## Grouping

`ordered_items.product_id` is **not** a consistent ranking identity:

- catalog writes often include a product id, but workshop uses `workshop-single` / null
- historical rows may omit it
- grouping all workshop rows by that id would merge distinct custom works

Grouping remains **product title** (`title` / `product_title` / `name`). Limitation: a later product rename can split historical rank rows.

Malformed line items (non-object, empty title, missing/non-positive quantity, missing/non-numeric price) are skipped. They do not crash the report. Missing quantity/price is not invented.

Tie-break: quantity DESC, revenue DESC, then title `ko` localeCompare.

## Images

The page-local production storage URL constant was unused and is removed. Thumbnails use `ordered_items` paths (`user_image_url` / `front_image` / `image` / `custom_image`) through existing `getFullImageUrl`. Missing/broken images use the in-page Package placeholder, not picsum or other fake imagery.

## Storefront

`AnnouncementBar`, ProductContext, AdminProducts, and catalog `display_order` are unchanged.

## Do Not Do

- Do not edit preserved WIP.
- Do not add ranking writes or merchandising controls.
- Do not commit / deploy / mutate production.
