# NEW3-5A — Admin shell / navigation rebuild

Status: **READY FOR NEW3-5A QA**

Date: 2026-10-05

Decision: Shared admin chrome lives in `AdminLayout` plus one navigation source of truth. Individual admin pages are unchanged. Storefront Header/Footer are unchanged. `/admin/settings` is not created.

## Admin routes included

Exact paths only, matching `src/App.tsx`:

| Path | Label |
|---|---|
| `/admin` | 대시보드 |
| `/admin/users` | 회원 관리 |
| `/admin/products` | 상품 관리 |
| `/admin/best-sellers` | 인기 판매 제품 |
| `/admin/banners` | 배너 관리 |
| `/admin/orders` | 주문 관리 |
| `/admin/cs` | CS 관리 |

`/admin/login` is outside this shell.

## Navigation source of truth

`src/components/admin/adminNav.ts` owns labels, routes, icons, exact-path active matching, and the header title.

Desktop sidebar and mobile drawer both render from `ADMIN_NAV_ITEMS`.

## Active-route rules

`pathname === path` only. `/admin` is not active for `/admin/*`.

## Desktop shell

Fixed in-flow left nav (`lg:w-72`, `shrink-0`). Main column `min-w-0 flex-1` so tables can overflow internally without stretching the page. Header shows the current nav title and 스토어 바로가기. Logout is in the sidebar footer. No settings item.

## Mobile navigation

Below `lg`, the desktop sidebar is not in the layout. Header includes an in-flow menu button (not a floating overlay). Opening it shows a `role="dialog"` drawer with all admin routes, store shortcut, and logout. Selecting a route navigates and closes. Escape / backdrop / 닫기 close the menu. Focus moves into the drawer and returns to the trigger. Main column is `inert` while open. Body overflow is locked.

## Accessibility

- `nav aria-label="관리자 메뉴"`
- `aria-current="page"` on the active link
- visible `focus-ring`
- icons `aria-hidden`; text labels required
- logout confirm is `alertdialog`

## Logout / store

Logout still uses existing `signOut()` after confirm. No auth rewrite. Store shortcut is `Link` to `/`.

## Dialog layering

Shell header `z-20`. Mobile nav `z-50`. Logout confirm `z-[90]`. Page-owned dialogs remain at `z-[100]` and above (Products / Orders / Users / CS).

## Deferred

- `/admin/settings` does not exist; not linked.

## NEW3-5B — Storefront admin header action

Status: **READY FOR NEW3-5B QA**

Date: 2026-10-05

Decision: The storefront Header control whose accessible label is `관리자 대시보드` navigates to `/admin`. It no longer opens ProfileOverlay. The same Header User control still opens ProfileOverlay when labeled `내 정보` for non-admin members. Anonymous users still open AccountDrawer. Visibility remains the existing Header admin flag (`profile?.is_admin || adminProfile?.is_admin`). No auth or admin-policy change. Desktop and mobile share this one Header action.

## Do Not Do

- Do not edit preserved WIP.
- Do not change individual admin page business logic.
- Do not commit / deploy / mutate production.
