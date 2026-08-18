---
name: create-pr
description: I create a PR with Gitmoji.
---

# PR Generator

Create a PR (Pull Request) from the current branch into `$ARGUMENTS`.

## Instructions

1. Push the current branch to `origin` (`git push -u origin <current-branch>`) if it isn't already there or is behind — `gh pr create` requires the branch to exist on the remote first.
2. Compare the current branch against `$ARGUMENTS`.
3. Analyze the overall purpose of the changes.
4. Generate:
   - a concise PR title;
   - a clear PR description.
5. Prefix the title with the most appropriate Gitmoji.
6. Use imperative mood for the title.

## PR Title

<gitmoji> <short imperative summary>

Example:

✨ Add meeting detail page shell

## PR Description

### Summary

- ...
- ...
- ...

Briefly explain the purpose of the PR.
Summarize instead of listing every changed file.
Keep the description under 10 bullet points.

### Test plan

Describe how the changes were verified, if applicable.

[ ] ...
[ ] ...

## Guidelines

- Focus on the overall feature rather than individual commits.
- Keep the description concise.
- Avoid listing every modified file.
- Ignore formatting-only changes unless they are the primary purpose.
