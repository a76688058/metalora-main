# H1-H — Home Header hero-boundary + true black

Status: **COMPLETE** (closed with NEW 2)

Date: closed 2026-10-01 with NEW 2

Decision: Home Header has two semantic zones. Hero zone stays idle-transparent; desktop hover is fully opaque theme surface. Content zone (when `#marquee-section` top meets the Header bottom) stays fully opaque regardless of hover. Dark Home Header surface is Header-specific `#000000`, not `--color-metal-dark` (`#1f2937`) and not dark `--color-surface` (`#121212`). No exact `#000000` token exists in `tokens.css`.

---

## Final Home Header contract

Boundary based on semantic Home collection marker `#marquee-section`. Before content reaches Header:

| Zone | Light | Dark |
|------|--------|------|
| Hero idle | transparent | transparent |
| Desktop hover (Hero) | opaque white | opaque `#000000` |
| Pointer leave (Hero) | transparent | transparent |
| Content | persistent opaque white | persistent opaque `#000000` |
| Return into Hero | idle transparent | idle transparent |
| Non-Home | existing persistent `surface-glass` | unchanged |

No:

- focus-within surface latch
- Search-open latch
- Drawer-open latch
- magic `scrollY > N`

---

## Final Drawer scroll-lock ownership

AccountDrawer owns scroll lock.

AccountDrawer:

- body overflow lock
- appropriate wheel/touch/key prevention
- restores original body styles
- does **not** set html/documentElement overflow hidden

Header:

- does **not** inspect/repair html overflow
- has **no** Drawer scroll-lock compensation

Result: sticky Hero remains pinned; no blank lower slab; no Home geometry jump; scroll position preserved.

---

## Accepted / non-blocking color residual

Some approved Auth/Drawer surfaces use near-black `#16150f` while shared Light primary is `#0a0a0a`. **ACCEPTED / NON-BLOCKING.** Do not reopen design.

---

## Completed

- Boundary: public A2 `#marquee-section` vs `header.getBoundingClientRect().bottom` via IntersectionObserver + rect remesure. No `scrollY > N`. No A4 Hero edit.
- CSS: `.header-home-over-content` persistent Light `var(--color-surface)` / Dark `#000000`.
- H1-F hover-only in Hero preserved.
- S1/S2: AccountDrawer owns body/listener scroll lock only. Header `document.documentElement` overflow compensation **removed**.

---

## Do Not Do

- Magic `scrollY` thresholds
- A4 Hero edits
- Reintroduce Header html-overflow repair
- Reopen NEW 2 Header/Auth from this note
- Deploy

Ownership: A1 (`Header.tsx`, `foundation.css`). Boundary id `#marquee-section` remains A2-owned; Header only observes it. AccountDrawer scroll lock is A3.

Relevant Files:

- `src/components/Header.tsx`
- `src/styles/foundation.css`
- `src/components/auth/AccountDrawer.tsx`
- `scripts/verify-2f-h1-header-light-type.ts`
- `scripts/verify-2f-s1-drawer-scroll-lock.ts`
