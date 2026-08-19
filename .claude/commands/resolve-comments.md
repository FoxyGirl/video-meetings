---
description: Address review comments in a PR (latest open one if none given)
argument-hint: [pr-url-or-number]
allowed-tools: Bash(gh*), Bash(git*)
model: sonnet
---

PR: "$ARGUMENTS"

If a PR URL or number is provided above, use that PR. Otherwise, find the latest open PR.

Check comments in this PR and fix them all by separate commits. When a comment is fixed by some commit, create a reply under it using the github cli.
