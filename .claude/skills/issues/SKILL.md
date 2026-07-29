---
name: issues
description: Creates issues and milestones on GitHub based on the file creation plan. I use it when I have a ready-made plan with milestones (phases) and need to create a backlog on GitHub.
---

# Plan Generator

Read the plan from the file: $ARGUMENTS

For each stage, create a milestone and issues in GitHub using the gh CLI.

## Procedure

1. Read the file plan
2. For each phase, create a milestone. Phase headings in these plans are written
   as `### Phase N-<feature-postfix>: <title>` (e.g. `### Phase 1-user-profile: ...`).
   Copy the heading text verbatim — including the `-<feature-postfix>` suffix on
   `Phase N` — into the milestone title. Do not collapse it down to just `Phase N`:
   `gh api repos/:owner/:repo/milestones -f title="Phase N-<feature-postfix>: title"`

3. For each task in a phase (milestone) create an issue:
   `gh issue create --title "..." --body "..." --label "..." --milestone "..."`

## Issue Format

**Title**: Issue text from the plan (without [])

**Body**: Issue descriptions
