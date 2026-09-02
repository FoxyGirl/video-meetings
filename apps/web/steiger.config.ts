import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

// Advisory only for now (Phase 1-fsd-v2): src/components and src/lib still
// exist alongside the FSD layers and will fail this until every domain is
// migrated (Phase 5-fsd-v2 wires this into npm run lint / pre-push once
// they're gone). _app/_pages are recognized natively as the underscore-
// prefixed variants of FSD's app/pages layers by @feature-sliced/filesystem
// — no renaming config needed here.
export default defineConfig([...fsd.configs.recommended]);
