/**
 * NEW2F S1 — AccountDrawer scroll-lock ownership cleanup.
 * Static contract. No live OAuth. No production. No Header edits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const drawer = read("src/components/auth/AccountDrawer.tsx");
const header = read("src/components/Header.tsx");
const loginModal = read("src/components/LoginModal.tsx");
const loginPage = read("src/pages/Login.tsx");
const hero = read("src/components/hero/HeroSpatial.tsx");

const lockEffectStart = drawer.indexOf("if (!isOpen) return;");
const lockEffectEnd = drawer.indexOf("}, [isOpen]);");
const lockEffect = lockEffectStart >= 0 && lockEffectEnd > lockEffectStart
  ? drawer.slice(lockEffectStart, lockEffectEnd)
  : "";

assert(
  "S1 A AccountDrawer does not write html overflow hidden",
  !drawer.includes("document.documentElement.style.overflow")
    && !drawer.includes("html.style.overflow")
    && !lockEffect.includes("document.documentElement.style"),
);

assert(
  "S1 B AccountDrawer still locks background scrolling",
  lockEffect.includes("body.style.overflow = 'hidden'")
    && lockEffect.includes("addEventListener('wheel'")
    && lockEffect.includes("addEventListener('touchmove'")
    && lockEffect.includes("{ passive: false }")
    && lockEffect.includes("preventDefault()"),
);

assert(
  "S1 C cleanup restores original body styles",
  lockEffect.includes("const prevOverflow = body.style.overflow")
    && lockEffect.includes("const prevPaddingRight = body.style.paddingRight")
    && lockEffect.includes("body.style.overflow = prevOverflow")
    && lockEffect.includes("body.style.paddingRight = prevPaddingRight")
    && !lockEffect.includes("body.style.overflow = ''")
    && !lockEffect.includes("body.style.overflow = \"\""),
);

assert(
  "S1 D lock effect is open-gated so close/unmount cleanup cannot leak",
  drawer.includes("if (!isOpen) return;")
    && lockEffect.includes("return () => {")
    && lockEffect.includes("removeEventListener('wheel'")
    && lockEffect.includes("removeEventListener('touchmove'")
    && lockEffect.includes("removeEventListener('keydown'"),
);

assert(
  "S1 E unmount while open restores styles via the same effect cleanup",
  lockEffect.includes("}, [isOpen]") === false
    && drawer.includes("}, [isOpen]);")
    && lockEffect.includes("body.style.overflow = prevOverflow"),
);

assert(
  "S1 F Drawer remains a fixed overlay",
  drawer.includes("'fixed inset-0 flex justify-end overflow-hidden'")
    && drawer.includes("sm:w-[24.5rem]")
    && header.includes("<AccountDrawer")
    && header.indexOf("</header>") < header.indexOf("<AccountDrawer"),
);

assert(
  "S1 G scrollY is not reset by Drawer lock",
  !lockEffect.includes("window.scrollTo")
    && !lockEffect.includes("scrollTop")
    && !lockEffect.includes("body.style.position")
    && !lockEffect.includes("body.style.top"),
);

assert(
  "S1 H Home sticky Hero contract is preserved by Drawer-owned code",
  !drawer.includes("document.documentElement.style.overflow")
    && hero.includes("sticky top-0 z-[1] h-[100svh]")
    && !drawer.includes("HeroSpatial"),
);

assert(
  "S1 I no html overflow change that would unpin sticky Hero",
  !drawer.includes("document.documentElement.style.overflow = 'hidden'")
    && !drawer.includes("html.style.overflow"),
);

assert(
  "S1 J scrollbar compensation is reversible and only when needed",
  lockEffect.includes("window.innerWidth - document.documentElement.clientWidth")
    && lockEffect.includes("if (scrollbarWidth > 0)")
    && lockEffect.includes("body.style.paddingRight = `${scrollbarWidth}px`")
    && lockEffect.includes("body.style.paddingRight = prevPaddingRight"),
);

assert(
  "S1 K mobile background scroll remains locked (touchmove non-passive)",
  lockEffect.includes("addEventListener('touchmove', preventBackgroundScroll, { passive: false })")
    && drawer.includes("w-full")
    && drawer.includes("sm:w-[24.5rem]"),
);

assert(
  "S1 L AccountDrawer visual contract unchanged",
  drawer.includes("로그인하고 제작하기")
    && drawer.includes("오직 당신만의 커스텀 작품을")
    && drawer.includes("만들어보세요.")
    && drawer.includes("화면 모드")
    && drawer.includes("/policy/terms")
    && drawer.includes("/policy/privacy")
    && drawer.includes("ml-acct-panel--dark")
    && drawer.includes("ml-acct-panel--light")
    && drawer.includes("sm:w-[24.5rem]"),
);

assert(
  "S1 M Drawer → Login layering unchanged",
  loginPage.includes("onRequestAuth={() => setAuthOpen(true)}")
    && loginPage.includes("inert={authOpen && !pendingSocial}")
    && loginPage.includes("<AccountDrawer")
    && loginPage.includes("<LoginModal")
    && loginModal.includes("layered")
    && !loginModal.includes("setIsAccountDrawerOpen"),
);

assert(
  "S1 N Header does not compensate Drawer scroll lock",
  !header.includes("document.documentElement.style.overflow")
    && !header.includes("html.style.overflow")
    && !header.includes("restoreHtmlOverflow")
    && !header.includes("if (!isAccountDrawerOpen) return")
    && header.includes("isAccountDrawerOpen")
    && header.includes("<AccountDrawer")
    && !header.includes("headerOwnedSurface"),
);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
