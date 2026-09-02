import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

// _app/_pages are recognized natively as the underscore-prefixed variants
// of FSD's app/pages layers by @feature-sliced/filesystem — no renaming
// config needed for that part.
export default defineConfig([
  ...fsd.configs.recommended,
  {
    // src/lib (and src/components) are pre-FSD legacy code that hasn't
    // been migrated into a layer — ESLint's boundaries rule already
    // leaves them unclassified/unchecked (eslint.config.mjs), so exclude
    // them here too rather than have "lib" misread as a typo'd layer name.
    ignores: ['src/lib/**', 'src/components/**'],
  },
  {
    // Off project-wide, not scoped to individual slices: at this app's
    // current size, the large majority of features/widgets are — by
    // design — used by exactly one consumer (a "feature" is a single,
    // isolated user action; a "widget" composes exactly one page's
    // section), so this heuristic flags the norm here, not the exception.
    // (Scoping the override to just those files was tried first, but
    // steiger's insignificant-slice check builds its reference graph only
    // from files the rule is enabled for — excluding a slice's own
    // consumers from that glob makes the *entity* they import look
    // falsely single-referenced too, e.g. entities/meeting-file dropping
    // from 7 real importers to 1 once its feature-slice importers were
    // excluded. A blanket off avoids that graph distortion.)
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // providers.tsx is the app layer's global provider composition (theme,
    // auth, query client, etc.) — it doesn't map to any of FSD's canonical
    // segment names (ui/api/model/lib/config), so this rule doesn't apply.
    files: ['src/_app/providers.tsx'],
    rules: { 'fsd/segments-by-purpose': 'off' },
  },
  {
    // _app/_pages are deliberately underscore-prefixed to dodge Next.js's
    // reserved app/pages folder names (see eslint.config.mjs's comment on
    // layerSequence) — not a typo of the real FSD layer names.
    files: ['src/_app/**', 'src/_pages/**'],
    rules: { 'fsd/typo-in-layer-name': 'off' },
  },
]);
