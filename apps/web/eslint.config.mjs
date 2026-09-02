import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';

// FSD layer order, lowest to highest — a layer may only import from itself
// (same slice) and layers strictly below it. Mirrors
// @feature-sliced/filesystem's own layerSequence (shared, entities,
// features, widgets, pages, app), so Steiger and this rule set agree on
// what each layer is called even though the folders are underscore-
// prefixed (_app, _pages) to dodge Next.js's reserved names.
const slicedLayers = ['entities', 'features', 'widgets', 'pages'];
const layerSequence = ['shared', ...slicedLayers, 'app'];

const upwardImportPolicies = layerSequence.slice(0, -1).map((type, i) => ({
  from: { element: { type } },
  disallow: { to: { element: { types: layerSequence.slice(i + 1) } } },
  message: `A "${type}" module may not import from a higher layer ({{to.type}}) — only from itself or a lower layer.`,
}));

// A slice may only be reached through its own files, never through a
// sibling slice on the same layer (e.g. features/auth-login importing
// features/auth-register) — same-slice imports (captured "slice" values
// equal) are unaffected since the negated pattern only matches a different
// slice.
const siblingSliceImportPolicies = slicedLayers.map((type) => ({
  from: { element: { type } },
  disallow: {
    to: { element: { type, captured: { slice: '!{{from.slice}}' } } },
  },
  message: `A "${type}" slice may not import from a sibling slice ({{to.captured.slice}}) — lift shared composition to a widget/page, or use an explicit FSD cross-import.`,
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
  ]),
  // Covers all of src/** so nothing new can slip in unchecked. "unknown"
  // imports (anything not under a recognized FSD layer — e.g. npm
  // packages) are left alone by `default: 'allow'`; only imports between
  // two *known* FSD elements are restricted.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/_app/**' },
        { type: 'pages', pattern: 'src/_pages/(*)/**', capture: ['slice'] },
        { type: 'widgets', pattern: 'src/widgets/(*)/**', capture: ['slice'] },
        {
          type: 'features',
          pattern: 'src/features/(*)/**',
          capture: ['slice'],
        },
        {
          type: 'entities',
          pattern: 'src/entities/(*)/**',
          capture: ['slice'],
        },
        { type: 'shared', pattern: 'src/shared/**' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [...upwardImportPolicies, ...siblingSliceImportPolicies],
        },
      ],
    },
  },
]);

export default eslintConfig;
