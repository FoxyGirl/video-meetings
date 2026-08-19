---
description: Detailed code review of a PR (latest open one if none given)
argument-hint: [pr-url-or-number]
allowed-tools: Bash(gh*), Bash(git*)
model: opus
---

PR: "$ARGUMENTS"

If a PR URL or number is provided above, review that PR. Otherwise, find the latest open PR.

Conduct a detailed code review. Check the architecture, security, performance, and compliance with the PRD. Leave comments in the PR via the gh cli.
