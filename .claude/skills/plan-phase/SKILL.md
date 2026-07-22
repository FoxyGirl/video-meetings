---
name: plan-phase
description: Breaking down the PRD into implementation phases. I use this when I have a completed PRD and need to create a development plan with independent phases.
---

# Plan Generator

Read the PRD from the file: $ARGUMENTS

Create an implementation plan and save it in the file 'docs/plan-$ARGUMENTS.md' (use the English translation and kebab-case)

## Plan Structure:

# Plan: {feature name}

**PRD:** $ARGUMENTS

**Date:** {current date}

## Implementation Phases

### Phase 1: {name}

**Goal:** What this phase delivers

**Affects:** backend / frontend / database

**Tasks:**

- [ ] Task 1
- [ ] Task 2

**When ready:** Specific criteria

### Phase 2: {name}

...

## Phasing Rules:

- Each phase must produce a workable result.
- Phases are independent; you can stop after any.
- The first phase is the minimum work path (Tracer Bullet)
- No more than seven tasks in one phase
- The backend and frontend of the same feature are in different phases.
- Each phase must have planned tests to cover the phase's functionality.
- If it's possible e2e tests have to be created before the implementation of the phase.
- Each phase must have a clear definition of "done" and acceptance criteria.

## Rules

- Read the PRD carefully; the plan must cover all the criteria for completion.
- Do not add tasks that are not in the PRD.
- If the PRD is incomplete, ask before creating the plan.
