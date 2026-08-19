---
description: Implement issues from a milestone by GitFlow
argument-hint: <milestone-name>
allowed-tools: Bash(git*), Bash(gh*)
---

Milestone: "$ARGUMENTS"

1. Derive a GitFlow feature branch name from the milestone: lowercase, keep only the short descriptive part before any "—"/":", replace spaces and non-alphanumeric characters with hyphens, and prefix with `feat/` (e.g. `feat/BE/password-change-endpoint`, `feat/FE/password-change-form`).
2. Check whether that branch already exists (`git branch --list` and `git ls-remote --heads origin`). If it does not exist, create it from `develop` following GitFlow (`git checkout develop && git pull && git checkout -b feature/<name>`). If it exists, check it out.
3. Take the issues from the milestone "$ARGUMENTS". Sort them by number in ascending order.
4. Implement these issues by sorted order, and as you implement them, make a commit according to GitFlow and close the issues, moving them to the "Done" status.
