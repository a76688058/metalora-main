# NEW3-1 — Admin product management rebuild

Status: **READY FOR NEW3-1 RE-QA**

Date: 2026-10-05

Decision: `/admin/products` fetches its own full catalog. Storefront `ProductContext` `.limit(20)` is untouched. Reorder is allowed only on the full unfiltered catalog. Admin product form exposes storefront-relevant operational fields only.

## Completed

- Admin catalog query in `src/components/admin/adminCatalog.ts`: no limit; sort `display_order ASC`, then `created_at`, then `id`.
- `AdminProducts` search (title / subtitle / id) does not mutate catalog order.
- One visibility filter: 전체 / 노출 / 숨김. Dead Filter glyph removed.
- Reorder (drag + up/down) only when search is empty and filter is 전체. Save writes `display_order` from the full catalog IDs, never filtered indexes.
- Create / edit / visibility / delete preserved. Delete uses an explicit `alertdialog`. Custom M price control kept.
- Distinct loading / fetch-error+retry / empty catalog / no-results states.
- Product form simplified (see below). Visibility stays on the product list.

## Product form

- `subtitle` label is **부가 문구** (not 작가명). Helper: PDP title + Home marquee hover.
- Catalog admin currently supports **exactly one** managed option: **M · 200 × 283 mm**.
- Extra `options[]` rows are never silently preserved or deleted.
- If `options.length > 1`, save is blocked and a read-only diagnostic summary is shown. Future confirmed sizes need an explicit product-model expansion.
- Legacy A4 / 21 x 29.7 cm|mm **single-option** products display as the M preset. Save may normalize name/dimension to M while preserving option id, price, stock, and isActive.
- `description` is SEO/meta/JSON-LD only, under collapsed **고급 설정 → SEO 설명**. Loaded on edit even if the section is never opened.
- Default image fields: 앞면 (required), 뒷면 optional as **3D 뷰어의 뒷면 이미지**.
- `supported_orientations`, `landscape_image`, `landscape_back_image` are hidden in the default form and preserved on save. New products stay portrait-only.
- Option IDs are generated automatically on create and preserved on edit of a single existing option. Opening the form does not write to the database.
- Price is editable per product. No hardcoded 79,000 / 89,000.
- 판매중 / 품절 maps to option `isActive`. Stock is an explicit operational field. No 999/1000 default. Storefront still requires `isActive && stock > 0`.
- 한정판 badge kept. Product visibility is not duplicated in the form; existing `is_visible` is sent unchanged on save.

## Do Not Do

- Do not edit `src/context/ProductContext.tsx` for this ticket.
- Do not change product schema.
- Do not restyle the whole admin shell.
- Do not deploy / commit from this ticket.

## Resume Condition

NEW3-1 re-QA after single-option save contract.
