/**
 * The LuParx Neon brand asset manifest — the single place any component reaches for a brand
 * asset path. Mirrors the source production site's own centralization
 * (`luparx-frontend/src/shared/branding/luparxSkin.ts`): one manifest, never a route-specific
 * literal path scattered across components.
 *
 * The files themselves are duplicated verbatim into every app's `public/brand/luparx-neon/`
 * (each Vite app serves its own `public/`), so the same manifest resolves in all four portals.
 *
 * Every path is built from `import.meta.env.BASE_URL` — the prefix the app was built with — and
 * never written as a root-relative literal. In development that prefix is `/` and nothing changes;
 * where the four portals share one domain under routes (`/admin/`, `/inspector/`…), a literal
 * `/brand/…` would leave every portal asking the domain's ROOT for its logo, and it would answer
 * with whichever app happens to be published there — working by coincidence today and 404 the day
 * the citizen portal moves.
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
/**
 * `/`, `/admin/`, … — always with a trailing slash, which is what Vite guarantees for BASE_URL.
 *
 * The cast is deliberate and local: `import.meta.env` is injected by the bundler, and this package
 * is compiled by whichever app consumes it. Declaring it globally here would collide with the
 * `vite/client` types the apps already pull in, and adding those types to every package's tsconfig
 * would make one boundary value everyone's configuration problem. The fallback covers the only
 * environment without a bundler — a unit test importing the manifest directly.
 */
const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export const BRAND_ASSETS = {
  markTransparent: `${BASE}brand/luparx-neon/luparx-mark-transparent.png`,
  wordmarkDark: `${BASE}brand/luparx-neon/luparx-wordmark-dark.png`,
  lockupDark: `${BASE}brand/luparx-neon/luparx-lockup-dark.png`,
  /** Full supplied composition — untouched. Not for use as an ambient background (see the
   * `*Bg` variants below): it has the wordmark and Spanish tagline baked into its pixels. */
  heroCitizen: `${BASE}brand/luparx-neon/luparx-hero-citizen-1600x900.jpg`,
  heroAdmin: `${BASE}brand/luparx-neon/luparx-hero-admin-1600x900.jpg`,
  heroInspector: `${BASE}brand/luparx-neon/luparx-hero-inspector-1600x900.jpg`,
  /**
   * Derived crops for `AuthScreen`'s dimmed background layer: the top ~58% of each supplied hero
   * (the glowing mark only), with the wordmark/tagline band cropped away entirely — not just
   * faded — so the baked Spanish text can never become legible at any opacity or viewport. This
   * is what "cropped toward the glowing mark" (see the source repo's CLAUDE.md) means in practice.
   */
  heroCitizenBg: `${BASE}brand/luparx-neon/luparx-hero-citizen-1600x900-bg.jpg`,
  heroAdminBg: `${BASE}brand/luparx-neon/luparx-hero-admin-1600x900-bg.jpg`,
  heroInspectorBg: `${BASE}brand/luparx-neon/luparx-hero-inspector-1600x900-bg.jpg`,
} as const;
