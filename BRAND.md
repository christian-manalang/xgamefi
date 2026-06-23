# xGameFi — Brand & Design System (BRAND.md)

> Visual system for xGameFi, derived directly from the provided mock storefront/builder/marketplace HTML. This is the source of truth for theme tokens, typography, and the signature "Neon Overdrive" treatment. The mock was authored against Tailwind v3 (JS config + CDN); this document re-expresses every token for the project's **Tailwind v4 CSS-first** setup. When in doubt, match the mock.

---

## 1. Brand essence

**Neon Overdrive** — high-contrast brutalist cyberpunk. Obsidian backgrounds, acid-lime as the hero accent, hot magenta and electric cyan as support. Sharp clipped corners, thin technical borders, scanline/glitch atmosphere, and uppercase monospace labels. It should feel like a piece of high-end gaming hardware: precise, energetic, a little dangerous — never soft or rounded.

The single thing to get right: **acid lime `#c3f400` on obsidian `#131313`, used sparingly as the energy of the page.** Everything else stays quiet so that accent lands.

This is a **dark theme only**. There is no light mode.

---

## 2. Color system

The mock uses Material-style token names. Note one trap carried over from the mock: the token literally named `primary` is **white** (`#ffffff`), while the actual brand accent is **`primary-fixed` (`#c3f400`)**. Keep both, but treat `primary-fixed` as "the brand green."

### Core surfaces & text
| Token | Hex | Role |
| --- | --- | --- |
| `background` / `surface` | `#131313` | Page background (obsidian). |
| `surface-container-lowest` | `#0e0e0e` | Deepest panels, footers, image wells. |
| `surface-container-low` | `#1c1b1b` | Cards. |
| `surface-container` | `#201f1f` | Raised cards, stat blocks. |
| `surface-container-high` | `#2a2a2a` | Inputs, hover surfaces. |
| `surface-container-highest` / `surface-variant` | `#353534` | Sliders, dividers, subtle fills. |
| `surface-bright` | `#3a3939` | Brightest neutral surface. |
| `on-background` / `on-surface` | `#e5e2e1` | Primary text. |
| `on-surface-variant` | `#c4c9ac` | Secondary text. |
| `outline` | `#8e9379` | Muted labels, hairlines. |
| `outline-variant` | `#444933` | Card borders, dividers. |

### Accents
| Token | Hex | Role |
| --- | --- | --- |
| **`primary-fixed`** | `#c3f400` | **Hero accent (acid lime).** CTAs, active states, focus, key prices, glows. |
| `primary-fixed-dim` | `#abd600` | Dimmed lime / nav borders. |
| `surface-tint` / `inverse-primary` | `#abd600` / `#506600` | Tints, disabled-green. |
| `on-primary-fixed` | `#161e00` | Text on lime. |
| `on-primary` | `#283500` | Text on `primary-container`. |
| `primary` / `tertiary` | `#ffffff` | "Primary" UI text/icons (white), per the mock. |
| `secondary-container` | `#fe00fe` | Hot magenta — secondary CTAs, rare/epic tags, accent borders. |
| `secondary` / `secondary-fixed-dim` | `#ffabf3` | Soft pink — secondary text/links, hover. |
| `secondary-fixed` | `#ffd7f5` | Lightest pink. |
| `on-secondary-container` | `#500050` | Text on magenta. |
| `tertiary-fixed` / `tertiary-container` | `#7df4ff` | Electric cyan — info, tertiary tags. |
| `tertiary-fixed-dim` | `#00dbe9` | Deep cyan — links/specs. |
| `on-tertiary-container` | `#006f77` | Text on cyan. |
| `error` | `#ffb4ab` | Error text / "limited" tags. |
| `error-container` | `#93000a` | Error fill. |
| `on-error-container` | `#ffdad6` | Text on error fill. |

### Glow values (atmosphere)
- `--primary-glow: rgba(195, 244, 0, 0.4)`
- `--secondary-glow: rgba(255, 0, 255, 0.3)`
- Neon shadows: `0 0 15–20px var(--primary-glow)` / `var(--secondary-glow)`.

### Rarity badge palette (from the marketplace cards)
`LEGENDARY` lime, `EPIC`/`MYTHIC` magenta (`secondary-container` on `on-secondary-container`), `RARE` cyan (`on-tertiary-container`/`tertiary-container`), `LIMITED` error (`error-container`/`on-error-container`).

---

## 3. Tailwind v4 implementation (CSS-first `@theme`)

The mock's `tailwind.config = {…}` does **not** apply in v4. Put the tokens in your global stylesheet using `@theme`. Colors registered here become utilities automatically (`bg-background`, `text-primary-fixed`, `border-outline-variant`, etc.).

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  /* surfaces */
  --color-background: #131313;
  --color-surface: #131313;
  --color-surface-container-lowest: #0e0e0e;
  --color-surface-container-low: #1c1b1b;
  --color-surface-container: #201f1f;
  --color-surface-container-high: #2a2a2a;
  --color-surface-container-highest: #353534;
  --color-surface-variant: #353534;
  --color-surface-bright: #3a3939;

  /* text / lines */
  --color-on-background: #e5e2e1;
  --color-on-surface: #e5e2e1;
  --color-on-surface-variant: #c4c9ac;
  --color-outline: #8e9379;
  --color-outline-variant: #444933;
  --color-inverse-surface: #e5e2e1;
  --color-inverse-on-surface: #313030;

  /* primary (note: brand green is *-fixed) */
  --color-primary: #ffffff;
  --color-primary-fixed: #c3f400;
  --color-primary-fixed-dim: #abd600;
  --color-primary-container: #c3f400;
  --color-surface-tint: #abd600;
  --color-inverse-primary: #506600;
  --color-on-primary: #283500;
  --color-on-primary-fixed: #161e00;
  --color-on-primary-fixed-variant: #3c4d00;
  --color-on-primary-container: #556d00;

  /* secondary / tertiary / error */
  --color-secondary: #ffabf3;
  --color-secondary-fixed: #ffd7f5;
  --color-secondary-fixed-dim: #ffabf3;
  --color-secondary-container: #fe00fe;
  --color-on-secondary: #5b005b;
  --color-on-secondary-container: #500050;
  --color-on-secondary-fixed: #380038;
  --color-on-secondary-fixed-variant: #810081;
  --color-tertiary: #ffffff;
  --color-tertiary-fixed: #7df4ff;
  --color-tertiary-fixed-dim: #00dbe9;
  --color-tertiary-container: #7df4ff;
  --color-on-tertiary: #00363a;
  --color-on-tertiary-container: #006f77;
  --color-on-tertiary-fixed: #002022;
  --color-on-tertiary-fixed-variant: #004f54;
  --color-error: #ffb4ab;
  --color-error-container: #93000a;
  --color-on-error: #690005;
  --color-on-error-container: #ffdad6;

  /* type */
  --font-display: "Space Grotesk", sans-serif;
  --font-body: "Space Grotesk", sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* layout */
  --spacing-gutter: 16px;
  --spacing-margin-mobile: 20px;
  --spacing-margin-desktop: 64px;
  --container-max: 1440px;

  /* radii — sharp by default */
  --radius-DEFAULT: 0.25rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
}

:root {
  --primary-glow: rgba(195, 244, 0, 0.4);
  --secondary-glow: rgba(255, 0, 255, 0.3);
}

body {
  background-color: var(--color-background);
  color: var(--color-on-background);
  font-family: var(--font-body);
}
::selection { background: #c3f400; color: #283500; }
```

Load fonts via `next/font` (Space Grotesk + JetBrains Mono) rather than CDN `<link>`, and load **Material Symbols Outlined** for icons (`font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`).

---

## 4. Typography

Two families do all the work: **Space Grotesk** for display + body, **JetBrains Mono** for technical labels.

| Style | Font | Size / line | Weight / tracking | Usage |
| --- | --- | --- | --- | --- |
| `headline-lg` | Space Grotesk | 48px / 52px | 700 / -0.02em | Page titles, hero (scale up to 72–80px for hero, per mock). |
| `headline-md` | Space Grotesk | 24px / 28px | 600 | Section + card titles, prices. |
| `body-md` | Space Grotesk | 16px / 24px | 400 | Body copy, nav links. |
| `label-technical` | JetBrains Mono | 12px / 16px | 500 / 0.1em, UPPERCASE | Eyebrows, tags, meta, button labels, stat captions. |

Rules: technical/mono labels are **uppercase with `0.1em` tracking**. Use **italic** Space Grotesk for emphasis and brand wordmarks (`xGameFi`, `NEON MARKET`). Prices and key numbers usually render in `primary-fixed`. Keep body copy in `on-surface`/`on-surface-variant` — never lime.

---

## 5. Layout & spacing

Container max `1440px`; desktop side margins `64px`, mobile `20px`; grid gutter `16px`. The signature layout is the **bento grid** (`grid-cols-12` or `md:grid-cols-4` with `col-span`/`row-span` feature cells). Dashboards use a fixed top nav (`h-20`) + a `w-64` left rail; the Shop Builder is a three-column shell (`w-64` tools · fluid preview · `w-80` library).

---

## 6. Signature treatments

These are what make it "Overdrive." Use them deliberately — one or two per view, not all at once.

**Clipped corners** — sharp diagonal cuts via `clip-path`, not border-radius:
```css
.clipped-corner   { clip-path: polygon(0 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%); }
.clipped-header   { clip-path: polygon(0 0, 100% 0, 100% 70%, 95% 100%, 0 100%); }
```

**Neon glow** — accent shadow on hover/active:
```css
.neon-glow-primary   { box-shadow: 0 0 15px var(--primary-glow); }
.neon-glow-secondary { box-shadow: 0 0 15px var(--secondary-glow); }
```

**Industrial border** — 2px accent border with a small tick mark:
```css
.industrial-border { border: 2px solid #c3f400; position: relative; }
.industrial-border::before { content:''; position:absolute; top:-5px; left:10px; width:20px; height:2px; background:#c3f400; }
```

**Scanlines** — fixed CRT overlay at low opacity, `pointer-events:none`, high `z-index`. **Glitch** — small `translate` jitter keyframe on hover. **Marquee** — looping mono ticker for status/asset feeds. **Skewed buttons** — `skew-x-[-12deg]` that straightens on hover. **Custom scrollbar** — 4px track, lime thumb. **Status pulse** — `animate-pulse` lime/error "LIVE_SYNC ACTIVE".

> All of these are decorative. **Gate scanlines, glitch, marquee, and pulse behind `@media (prefers-reduced-motion: reduce)`** and disable them when reduced motion is requested.

---

## 7. Component patterns

- **Buttons.** Primary = `bg-primary-fixed text-on-primary-fixed`, mono uppercase label, `active:scale-95`, optional skew + neon glow. Secondary = `border-2 border-secondary-container text-secondary-container` (or pink). Ghost/utility = bordered `outline` that lights to `primary-fixed` on hover. Icon buttons use Material Symbols.
- **Cards (item).** `bg-surface-container-low border-2 border-outline-variant`, hover → `border-secondary` / `border-primary-fixed` + lift. Image in an `aspect-square`/`aspect-video` well; rarity badge top-left; price in `primary-fixed`; cart icon button bottom-right. Featured/bento cards get `industrial-border` + `neon-glow`.
- **Nav.** Sticky top bar `h-20`, `border-b-2 border-primary` with a faint lime drop shadow; wordmark italic; active link underlined in `secondary`. Side rail active item: `bg-primary text-on-primary border-l-4 border-secondary`.
- **Inputs.** "Terminal" style: transparent, bottom-border only, focus border → `primary-fixed` with a soft lime shadow. Placeholders in mono, uppercase, muted.
- **Badges / tags.** Mono `10px` uppercase, solid accent fills per rarity (§2).
- **Stat blocks / live feed.** `surface-container` panels, mono captions in `on-surface-variant`, values in `primary-fixed`/`secondary`. The demo's transaction feed is a vertical list of `#id SOLD / LISTED` rows with accent amounts.

---

## 8. Imagery

High-contrast 3D/product renders of gear (skins, cores, blades, hardware) on obsidian backgrounds with lime/magenta/cyan rim light and floating glitch particles. Always pair images with a top-or-bottom gradient to `background` so overlaid text stays legible. Avoid flat, bright, or pastel photography — it breaks the world.

---

## 9. Accessibility & quality floor

- **Motion:** respect `prefers-reduced-motion` — no scanlines/glitch/marquee/pulse when reduced.
- **Contrast:** body text `#e5e2e1` on `#131313` is strong. Be careful with `outline` `#8e9379` and `on-surface-variant` `#c4c9ac` on dark — reserve for non-essential meta, keep at ≥12px, and verify ≥4.5:1 for anything important. **Never put `primary-fixed` lime text on white**; lime is for dark surfaces and fills only (`on-primary-fixed` for text *on* lime).
- **Focus:** every interactive element needs a visible focus state (a `primary-fixed` outline/ring works on-brand) — don't rely on glow alone.
- **Don't encode meaning in color/glow only** (e.g. status): pair with a mono label or icon.

---

## 10. Voice & UI copy

Terse, technical, confident — mono uppercase for labels and system status ("SYSTEM STATUS: NOMINAL", "LIVE_SYNC ACTIVE", "OVERDRIVE PROTOCOL"). Keep flavor on labels and chrome; keep **functional copy clear and literal** (button says exactly what it does, errors say what went wrong and how to fix it). The wordmark is `xGameFi` (italic). Per-studio storefronts override the wordmark/colors with the studio's brand while keeping this structural system.

---

## 11. Do / Don't

**Do** — keep obsidian dominant and lime scarce; use sharp clipped corners and 2px technical borders; label with uppercase mono; lift cards on hover with a single accent glow; brand each storefront with the studio's colors over this skeleton.

**Don't** — round everything off; flood the page with lime; stack every effect at once; use lime as readable text on light fills; ship motion without a reduced-motion fallback; introduce a light theme.
