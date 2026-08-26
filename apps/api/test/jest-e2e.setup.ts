import { config } from 'dotenv';
import { resolve } from 'path';

// .env.test (committed) supplies the test DB/JWT config and always wins.
// .env (gitignored) fills in anything .env.test doesn't set — e.g.
// ANTHROPIC_API_KEY for agent-sdk.e2e-spec.ts — so real secrets never need
// to live in a committed file. dotenv's config() never overrides a key
// already present in process.env, so loading .env second is safe.
config({ path: resolve(__dirname, '../.env.test') });
config({ path: resolve(__dirname, '../.env') });
