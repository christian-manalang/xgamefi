# xGameFi — Logo Generation Prompts (LOGO.md)

Image-generation prompts for the xGameFi mark, derived from `SPEC.md` (commerce infrastructure for game studios; Stellar-powered storefronts; in-game items, payments, P2P trading) and `BRAND.md` (Neon Overdrive: obsidian `#131313`, acid-lime `#c3f400`, hot magenta `#fe00fe`, electric cyan `#7df4ff`; sharp clipped corners, thin technical borders, scanline/glitch atmosphere).

---

## 1. Concept

**"The Overdrive Token"** — a single, instantly recognizable symbol that fuses three ideas from the product:

- **Gaming** — a stylized crossed-blade / arcade-strike gesture.
- **Payments & multiply** — a bold **`X`** mark (the `x` in `xGameFi`, and a multiply/transaction sign).
- **Stellar / on-chain** — a hexagonal coin/token chassis with clipped brutalist corners.

The mark is an **angular hexagon token** with sharp diagonal clip-cuts (no rounded corners), containing a single bold **`X`** formed by two crossing blade strokes. One stroke is **acid lime** (the hero accent, used sparingly — the "energy"); the other carries a thin **magenta→cyan** hairline to seat the cyberpunk palette without flooding it. A faint inner scanline grid and a hairline technical border keep it precise and hardware-like. It must read at 24px, emboss/foil at any size, and survive silhouette reduction.

**Symbol only. No text, no wordmark, no lettering.**

---

## 2. General style (applies to every output)

- Symbol only, no text or letterforms of any kind.
- A flat, geometric, brutalist-cyberpunk icon — high-contrast, sharp clipped corners, 2px technical hairlines, no soft rounded radii.
- Easily recognizable at small sizes; centered, generous padding, balanced negative space.
- Square 1:1 canvas, icon optically centered, mark fills ~70% of frame.
- Crisp vector-style edges; clean enough to trace into a true SVG path. Avoid painterly texture, gradients-as-form, depth blur, or photorealism.
- No background scene, no environment, no characters — the mark sits on a flat field.

---

## 3. Outputs

### 3.1 Colored (full Neon Overdrive)

```
A flat vector logo mark, symbol only, no text. An angular hexagonal token with sharp clipped diagonal corners (brutalist, no rounded radii), framed by a thin 2px technical hairline border. At its center, a single bold "X" formed by two crossing blade strokes: one thick stroke in acid lime (#c3f400) carrying a soft lime neon glow, the other stroke a thin hairline shifting from hot magenta (#fe00fe) to electric cyan (#7df4ff). A faint horizontal scanline grid and subtle glitch jitter line the interior; one small industrial tick mark sits on the top-left edge. Obsidian #131313 flat background. Palette strictly: acid lime #c3f400 as the scarce hero accent, hot magenta #fe00fe and electric cyan #7df4ff as restrained support, everything else obsidian black. High-contrast, precise, energetic, a little dangerous — like high-end gaming hardware. Flat geometric vector style, crisp clean edges suitable for SVG tracing, centered with generous padding, square 1:1 canvas, icon fills about 70% of the frame. No characters, no scene, no photorealism, no gradient-as-form, no depth blur, no wordmark, no lettering.
```

### 3.2 White-only silhouette on dark background

```
A flat one-color logo mark, symbol only, no text. The same angular hexagonal token with sharp clipped diagonal corners and a thin technical hairline border, with the bold "X" of two crossing blade strokes at center — rendered entirely as a single solid white silhouette (pure white #ffffff) on a flat obsidian #131313 background. No internal color, no gradients, no glow; all form carried by positive/negative space and stroke weight alone. Keep the clipped corners, the 2px hairline frame, and the small industrial tick mark legible. High-contrast, brutalist, cyberpunk-icon feel. Crisp vector edges suitable for SVG tracing, centered with generous padding, square 1:1 canvas, icon fills about 70% of the frame. No characters, no scene, no lettering, no wordmark.
```

### 3.3 Dark silhouette on white background

```
A flat one-color logo mark, symbol only, no text. The same angular hexagonal token with sharp clipped diagonal corners and a thin technical hairline border, with the bold "X" of two crossing blade strokes at center — rendered entirely as a single solid black silhouette (pure black #000000) on a flat pure white #ffffff background. No internal color, no gradients, no glow; all form carried by positive/negative space and stroke weight alone. Keep the clipped corners, the 2px hairline frame, and the small industrial tick mark legible. High-contrast, brutalist, cyberpunk-icon feel. Crisp vector edges suitable for SVG tracing, centered with generous padding, square 1:1 canvas, icon fills about 70% of the frame. No characters, no scene, no lettering, no wordmark.
```

---

## 4. Notes for the generator

- The two silhouettes (3.2, 3.3) must be the **exact same geometry** as the colored mark (3.1), only the fill/inversion differs — so all three read as one logo family.
- If the model adds a wordmark or any lettering, re-roll; "symbol only" is a hard constraint.
- Keep lime scarce even in the colored version: lime is the single glowing stroke; magenta/cyan are thin support only. Flooding the mark with color breaks the brand.
- Final delivery target is a clean traceable icon, so prefer flat vector rendering over 3D/photoreal product renders (BRAND.md §8 imagery style is for product art, not the logo).