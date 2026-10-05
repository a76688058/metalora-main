# NEW3-7 — Admin banners safety cleanup

Status: **READY FOR NEW3-7 RE-QA**

Date: 2026-10-05

Decision: `/admin/banners` keeps the existing banners table and layout. Safety holes are closed: delete requires confirmation, reorder writes only `display_order`, toggle writes only `is_active`. Storefront `AnnouncementBar` is unchanged.

## Data contract

Table `public.banners`. Fields used:

`id`, `content`, `is_active`, `display_order`, `created_at`

No new columns. No image pipeline. Admin remains the only writer.

## Storefront dependency

`AnnouncementBar` still reads `is_active = true`, ordered by `display_order`, and keeps its existing fallback. This ticket does not edit that component.

## Delete confirmation

Delete is no longer immediate. An `alertdialog` shows the banner text, a red 삭제 action, and 취소. Cancel performs no mutation. Duplicate submit is blocked while `isDeleting`. Escape / 취소 close without writing.

## Toggle

Updates only `is_active` for the exact row `id`. Duplicate toggles on the same row are blocked. Failure does not show success and does not patch local state.

## Reorder

“순서 저장” remains an explicit save (not write-on-drag). Persistence is per-id `update({ display_order })` only.

It does **not** upsert `content` or `is_active`. A missing/deleted id is a no-op update (cannot recreate the row). Save failure does not toast success; the list reloads from the server.

## Create

Content is required after trim. `display_order` is `max(existing display_order) + 1`, or `0` when the list is empty. Not `banners.length`.

There is no in-place content editor on this page.

## Error / empty

- loading: spinner
- fetch error: generic message + 다시 시도 (no empty-list, no SQL/schema dump)
- ready with zero rows: 등록된 배너가 없습니다

## Generation / race

List fetches and mutations share one `requestGenRef`. `loadBanners()` increments the generation, then only that newest generation may set `banners` / `ready` / `error`.

After a successful create, delete, toggle, or reorder, any older in-flight list snapshot is invalidated by starting one fresh `loadBanners()`. That reload is the completion path; generation is not incremented without a request that can resolve `loadState`.

Create / delete / toggle are disabled while `loadState === 'loading'` or `isSavingOrder` (including reorder-failure recovery reload). The delete dialog is closed when a reload starts. Confirm is rejected if a reload/order save is already active.

Unmount sets `mountedRef = false` and increments the generation so mutation and reload completions cannot `setState` after unmount.

## Do Not Do

- Do not edit `AnnouncementBar` or preserved WIP.
- Do not change banners schema.
- Do not commit / deploy / mutate production.
