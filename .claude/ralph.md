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
- Run the '/review' skill for code review.
- Close the issue.
- Don't create a PR - Stop Hook will do that.
- After closing one issue, immediately terminate the session.
- Don't take the next issue yourself.
- Stop Hook will automatically start a new session for the next issue.
