# Ralph Loop - Rules for Autonomous Work

## How to Take Issues

- Read the title, body, and the done criteria.
- Check that the specified branch already exists (if not, create it).
- Work only on this branch - do not create new ones.

## Commit Naming

- Each issue must be saved in a separate commit.
- Follow the rules in the skill '/git-commit'.

## Implementation Rules

- Tests first, then implementation (TDD).
- Run tests after each final change.
- If tests are red after 5 attempts, stop and write a comment in the Issue describing the problem.

## Completion Rules

- Ensure all tests are green.
- Make sure all criteria are met.
- Commit your changes now, following the '/git-commit' skill. Do this before running review — if you run low on turns, a committed fix beats an uncommitted one still being reviewed.
- Run the '/review' skill for code review. If it finds issues, fix them and commit again (a new commit, not an amend).
- Close the issue.
- Don't create a PR - Stop Hook will do that.
- After closing one issue, immediately terminate the session.
- Don't take the next issue yourself.
- Stop Hook will automatically start a new session for the next issue.

## Local Environment

- Postgres (`docker compose up -d db`) and the dev servers (`npm run dev` — web on :3000, api on :3001) are already running in the background for the whole Ralph session.
- Don't run `docker compose up`, `npm run dev`, `npm run dev:web`, or `npm run dev:api` yourself — they're long-running processes and starting them again will just hang the turn or collide with the ports already in use.
- For manual/browser verification (e.g. with the Playwright MCP tools), navigate straight to `http://localhost:3000` (web) or `http://localhost:3001` (api) — no setup needed first.

## If You Get Stuck

- If you hit an unexpected environment problem (e.g. database schema drift, a failing tool permission, a broken local service) that isn't about the issue's own logic, don't leave the working tree in a half-fixed state.
- Commit whatever passing, reviewed work you already have. If nothing is committable, leave the working tree exactly as you found it (revert your own uncommitted changes) rather than abandoning it half-edited.
- Write a comment on the issue describing the problem before terminating, so the next iteration (or a human) has context instead of silence.
