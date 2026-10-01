/**
 * H1 Home Header hover surface + Light typography tokens.
 * Static contract only. No live OAuth. No production.
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

function hexLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const header = read("src/components/Header.tsx");
const foundation = read("src/styles/foundation.css");
const tokens = read("src/styles/tokens.css");
const input = read("src/components/ui/Input.tsx");
const announcement = read("src/components/AnnouncementBar.tsx");
const drawer = read("src/components/auth/AccountDrawer.tsx");
const login = read("src/components/LoginModal.tsx");

const lightPrimary = tokens.match(/--color-text-primary:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
const darkBlock = tokens.slice(tokens.indexOf(".dark {"));
const darkPrimary = darkBlock.match(/--color-text-primary:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
const lightSecondary = tokens.match(/--color-text-secondary:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
const lightTertiary = tokens.match(/--color-text-tertiary:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
const darkSecondary = darkBlock.match(/--color-text-secondary:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
const darkTertiary = darkBlock.match(/--color-text-tertiary:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
const darkDisabled = darkBlock.match(/--color-disabled:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";

const homeQuietBlock = foundation.slice(
  foundation.indexOf(".header-home-quiet {"),
  foundation.indexOf("@media (prefers-reduced-motion"),
);

assert(
  "A Home Header idle is transparent (header-home-quiet)",
  header.includes("header-home-quiet")
    && /isHome[\s\S]{0,40}\? 'border-transparent bg-transparent'/.test(header)
    && homeQuietBlock.includes("background-color: transparent"),
);

assert(
  "B Home Header background is not activated by arbitrary scrollY",
  !header.includes("isScrolled")
    && !header.includes("isHeroTop")
    && !/scrollY\s*>/.test(header)
    && !/window\.scrollY\s*>/.test(header)
    && header.includes("IntersectionObserver")
    && header.includes("getElementById('marquee-section')"),
);

const hoverMedia = homeQuietBlock.slice(
  homeQuietBlock.indexOf("@media (hover: hover) and (pointer: fine)"),
);
const hoverLightCss = hoverMedia.slice(0, hoverMedia.indexOf(".dark .header-home-quiet:hover"));
const hoverDarkCss = hoverMedia.slice(hoverMedia.indexOf(".dark .header-home-quiet:hover"));
const iconButton = read("src/components/ui/IconButton.tsx");

assert(
  "C Desktop hover activates Header surface only with hover-capable pointers",
  foundation.includes("@media (hover: hover) and (pointer: fine)")
    && hoverLightCss.includes(".header-home-quiet:hover")
    && hoverLightCss.includes("background-color: var(--color-surface)")
    && hoverDarkCss.includes("background-color: #000000"),
);

assert(
  "H1-F B Light hover is 100% opaque --color-surface",
  hoverLightCss.includes("background-color: var(--color-surface)")
    && !hoverLightCss.includes("0.86")
    && !hoverLightCss.includes("backdrop-filter: blur")
    && !hoverLightCss.includes("--color-metal-dark"),
);

assert(
  "H1-H D Dark hover/content is 100% opaque true black",
  hoverDarkCss.includes("background-color: #000000")
    && homeQuietBlock.includes(".header-home-over-content")
    && homeQuietBlock.includes("background-color: #000000")
    && !homeQuietBlock.includes("--color-metal-dark")
    && !homeQuietBlock.includes("#1f2937")
    && !hoverMedia.includes("backdrop-filter: blur"),
);

assert(
  "H1-F I Light hover icons use text-primary",
  hoverLightCss.includes("color: var(--color-text-primary)")
    && !header.includes("header-home-wordmark"),
);

assert(
  "H1-H M Dark hover/content icons are white",
  hoverDarkCss.includes("color: #ffffff")
    && /header-home-over-content[\s\S]*color: #ffffff/.test(homeQuietBlock),
);

assert(
  "D pointer leave returns transparent via exit duration (no snap)",
  homeQuietBlock.includes("transition-duration: 220ms")
    && homeQuietBlock.includes("var(--ease-exit)")
    && homeQuietBlock.includes("var(--duration-fast)"),
);

assert(
  "H1-F G focus-within alone does not paint Home Header surface",
  !homeQuietBlock.includes(":focus-within")
    && !header.includes("onMouseEnter"),
);

assert(
  "H1-F H/I search/drawer open do not latch Header surface",
  !header.includes("headerOwnedSurface")
    && !header.includes("header-home-surface")
    && header.includes("setIsSearchOpen")
    && header.includes("setIsAccountDrawerOpen(true)")
    && header.includes("<AccountDrawer"),
);

assert(
  "H1-H F/G content zone class is persistent opaque, not hover-latched",
  header.includes("header-home-over-content")
    && header.includes("contentTop <= headerBottom")
    && !header.includes("headerOwnedSurface")
    && homeQuietBlock.includes(".header-home-quiet.header-home-over-content")
    && /header-home-over-content \{[\s\S]*background-color: var\(--color-surface\)/.test(homeQuietBlock),
);

assert(
  "H1-G B/C AccountDrawer remains a fixed overlay, not a Home layout sibling",
  drawer.includes("'fixed inset-0 flex justify-end overflow-hidden'")
    && drawer.includes("sm:w-[24.5rem]")
    && header.includes("<AccountDrawer")
    && header.indexOf("</header>") < header.indexOf("<AccountDrawer"),
);

assert(
  "H1-G Header does not repair AccountDrawer scroll lock",
  !header.includes("document.documentElement.style.overflow")
    && !header.includes("html.style.overflow")
    && !header.includes("restoreHtmlOverflow")
    && !header.includes("if (!isAccountDrawerOpen) return")
    && header.includes("isAccountDrawerOpen")
    && header.includes("<AccountDrawer")
    && drawer.includes("body.style.overflow = 'hidden'")
    && !drawer.includes("document.documentElement.style.overflow")
    && !header.includes("headerOwnedSurface"),
);

assert(
  "H1-F O Header controls keep focus-ring",
  iconButton.includes("'focus-ring inline-flex")
    && header.includes("variant=\"ghost\""),
);

assert(
  "G mobile/touch does not emulate sticky hover",
  !header.includes("onTouchStart")
    && foundation.includes("@media (hover: hover) and (pointer: fine)")
    && !/\.header-home-quiet:hover/.test(
      foundation.slice(0, foundation.indexOf("@media (hover: hover) and (pointer: fine)")),
    ),
);

assert(
  "H non-Home Header still uses surface-glass",
  header.includes("surface-glass border-border-subtle shadow-raised")
    && header.includes("isHome")
    && header.includes("export default function Header({ isHome = false }"),
);

assert(
  "I Header layout dimensions unchanged",
  header.includes("height: 'var(--shell-nav-height)'")
    && header.includes("'h-7 w-auto object-contain")
    && foundation.includes("--shell-nav-height: 4rem")
    && foundation.includes("--shell-announcement-height: 2rem"),
);

assert(
  "J announcement strip unchanged and not on hover surface",
  announcement.includes("minHeight: 'var(--shell-announcement-height)'")
    && announcement.includes("h-8")
    && announcement.includes("type-metadata")
    && header.includes("<AnnouncementBar />")
    && header.indexOf("<AnnouncementBar />") < header.indexOf("header-home-quiet"),
);

assert(
  "K Light primary foreground is strong dark/near-black",
  /^#[0-9a-fA-F]{6}$/.test(lightPrimary)
    && hexLuminance(lightPrimary) < 0.05
    && lightPrimary.toLowerCase() !== "#4b5563",
);

assert(
  "L Headings use primary foreground",
  foundation.includes(".type-page-title")
    && foundation.includes(".type-section-title")
    && /color:\s*var\(--color-text-primary\)/.test(
      foundation.slice(
        foundation.indexOf(".type-display,"),
        foundation.indexOf(".type-page-title {"),
      ),
    ),
);

assert(
  "M form labels use primary foreground",
  input.includes("type-label text-text-primary")
    && !input.includes("type-label text-text-secondary"),
);

assert(
  "N Drawer primary copy uses heading role (shared primary color)",
  drawer.includes("type-page-title")
    && foundation.includes("color: var(--color-text-primary)"),
);

assert(
  "O Auth can inherit Light body foreground without layout change",
  tokens.includes("--color-text-primary: #0a0a0a")
    && login.includes("const labelClass")
    && login.includes("loginLabelClass")
    && login.includes("surfaceView === 'login'"),
);

assert(
  "P secondary/muted token remains distinct from primary",
  lightSecondary.toLowerCase() === "#4b5563"
    && lightSecondary.toLowerCase() !== lightPrimary.toLowerCase()
    && lightTertiary.toLowerCase() === "#7a8494",
);

assert(
  "Q placeholder remains secondary/tertiary",
  input.includes("placeholder:text-text-tertiary")
    && header.includes("placeholder:text-text-tertiary"),
);

assert(
  "R disabled remains visually disabled",
  input.includes("disabled:text-disabled")
    && tokens.includes("--color-disabled: #a8b0bc")
    && darkDisabled.toLowerCase() === "#4b5563",
);

assert(
  "S Dark mode foreground tokens unchanged",
  darkPrimary.toLowerCase() === "#ffffff"
    && darkSecondary.toLowerCase() === "#a8b0bc"
    && darkTertiary.toLowerCase() === "#6b7280",
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exitCode = 1;
}
