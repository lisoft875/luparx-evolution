/**
 * The LuParx Neon brand asset manifest — the single place any component reaches for a brand
 * asset path. Mirrors the source production site's own centralization
 * (`luparx-frontend/src/shared/branding/luparxSkin.ts`): one manifest, never a route-specific
 * literal path scattered across components.
 *
 * The files themselves are duplicated verbatim into every app's `public/brand/luparx-neon/`
 * (each Vite app serves its own `public/` at its own root), so the root-relative paths below
 * resolve identically no matter which app renders them.
 *
 * Usage rules carried over from the source pack's `docs/skin-spec.md` (do not violate these):
 * - `markTransparent` is the ONLY asset safe on any background — it is genuinely transparent.
 * - `wordmarkDark` / `lockupDark` are opaque, composed on near-black — dark brand surfaces only
 *   (auth/login screens, app shell chrome). Never place them on a light or busy background.
 * - Never stretch, recolor, or rotate any of these. `ADMIN` / `INSPECTOR` role suffixes are
 *   rendered as text next to the wordmark, never as separate raster logos.
 * - The hero photography has its (Spanish) tagline baked into the pixels — it may only be used as
 *   a dimmed background layer with translated text on top, never as the message itself.
 */
export const BRAND_ASSETS = {
  markTransparent: '/brand/luparx-neon/luparx-mark-transparent.png',
  wordmarkDark: '/brand/luparx-neon/luparx-wordmark-dark.png',
  lockupDark: '/brand/luparx-neon/luparx-lockup-dark.png',
  /** Full supplied composition — untouched. Not for use as an ambient background (see the
   * `*Bg` variants below): it has the wordmark and Spanish tagline baked into its pixels. */
  heroCitizen: '/brand/luparx-neon/luparx-hero-citizen-1600x900.jpg',
  heroAdmin: '/brand/luparx-neon/luparx-hero-admin-1600x900.jpg',
  heroInspector: '/brand/luparx-neon/luparx-hero-inspector-1600x900.jpg',
  /**
   * Derived crops for `AuthScreen`'s dimmed background layer: the top ~58% of each supplied hero
   * (the glowing mark only), with the wordmark/tagline band cropped away entirely — not just
   * faded — so the baked Spanish text can never become legible at any opacity or viewport. This
   * is what "cropped toward the glowing mark" (see the source repo's CLAUDE.md) means in practice.
   */
  heroCitizenBg: '/brand/luparx-neon/luparx-hero-citizen-1600x900-bg.jpg',
  heroAdminBg: '/brand/luparx-neon/luparx-hero-admin-1600x900-bg.jpg',
  heroInspectorBg: '/brand/luparx-neon/luparx-hero-inspector-1600x900-bg.jpg',
} as const;
