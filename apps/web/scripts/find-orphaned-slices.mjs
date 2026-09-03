#!/usr/bin/env node
// Flags a slice under _pages/widgets/features/entities that no file
// anywhere else in src/ or app/ imports — a case
// `fsd/insignificant-slice` can't catch on its own here: that Steiger rule
// is a single check emitting both a "referenced by exactly one other
// location" diagnostic and a "referenced by zero" diagnostic from the same
// pass, and this app turns the whole rule off (steiger.config.ts) because
// the single-reference case is the norm for this app's size, not a smell.
// This script covers only the zero-references (orphaned/dead slice) case
// that the blanket-off would otherwise silence.
//
// Detection is import-string based (looks for `@/<layer>/<slice>` in every
// .ts/.tsx file outside the slice itself), not a resolved module graph —
// this matches every cross-slice import in this codebase today, which
// always goes through the `@/*` alias (never a relative reach into another
// slice's directory), so it's a reliable signal without needing a real
// TypeScript program.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(fileURLToPath(import.meta.url), '..', '..');
const srcDir = join(webRoot, 'src');
const appDir = join(webRoot, 'app');

// Layer directory name as it appears both on disk and in the `@/*` alias.
const SLICED_LAYERS = ['_pages', 'widgets', 'features', 'entities'];

function listDirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = [...listSourceFiles(srcDir), ...listSourceFiles(appDir)];
const fileContents = new Map(
  allFiles.map((file) => [file, readFileSync(file, 'utf8')]),
);

const orphans = [];

for (const layer of SLICED_LAYERS) {
  const layerDir = join(srcDir, layer);
  if (!statSync(layerDir, { throwIfNoEntry: false })?.isDirectory()) {
    continue;
  }

  for (const slice of listDirs(layerDir)) {
    const sliceDir = join(layerDir, slice);
    // Word-boundary on the tail end only: a slice name is never a prefix of
    // another import specifier's path segment (e.g. "meeting" must not
    // match "@/entities/meeting-file"), but *is* always followed by a
    // closing quote (bare import) or a "/" (a deep import, which the
    // boundaries/no-deep-imports convention shouldn't produce, but would
    // still count as a reference if it ever did).
    const referencePattern = new RegExp(`@/${layer}/${slice}(?:["'/]|$)`);

    const isReferenced = allFiles.some((file) => {
      if (file.startsWith(sliceDir)) {
        return false; // a slice's own files don't count as its consumer
      }
      return referencePattern.test(fileContents.get(file));
    });

    if (!isReferenced) {
      orphans.push(`${layer}/${slice}`);
    }
  }
}

if (orphans.length > 0) {
  console.error('Orphaned slice(s) — never imported anywhere:\n');
  for (const orphan of orphans) {
    console.error(`  src/${orphan}`);
  }
  console.error('\nRemove the slice, or wire it up if it was only just added.');
  process.exit(1);
}

console.log('No orphaned slices found.');
