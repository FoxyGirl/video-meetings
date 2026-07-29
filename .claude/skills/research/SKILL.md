---
name: research
description: Research the best technical approach for implementing a feature or plan.
---

# Research

Conduct a technical research for implementing **$ARGUMENTS**.

## Goals

Analyze the best implementation strategy considering:

- existing project architecture;
- current codebase patterns;
- maintainability;
- scalability;
- performance;
- developer experience;
- compatibility with existing libraries and infrastructure.

Do not invent a new architecture if an existing project pattern already solves the problem.

Prefer existing project conventions over introducing new abstractions.

Avoid suggesting libraries or architectural patterns that are inconsistent with the current codebase unless there is a strong justification.

Before proposing a solution, search the repository for similar implementations and reference them in the research.

## Research process

1. Read the implementation plan for **$ARGUMENTS**.
2. Inspect the current codebase for similar implementations.
3. Identify reusable components, utilities, hooks, services and patterns.
4. Compare possible implementation approaches.
5. Recommend the best approach with clear reasoning.
6. Identify potential risks and trade-offs.

## Output

Save the research as:

`docs/research-$ARGUMENTS.md`

Use English and kebab-case for the filename.

The document should contain:

# Research: {feature}

## Goal

## Recommended solution

Explain why this solution is preferred.

## Reusable code

List components, hooks, services, utilities or modules that should be reused.

## Risks

## Open questions

## References

Relevant files and directories.

## Link the research into the plan

Once the research file is saved, wire it up in two places:

1. In the implementation plan file (**$ARGUMENTS**), add a `**Research:**` line immediately
   after its existing `**PRD:**` line, pointing to the research file just saved — e.g.:

   ```
   **PRD:** @docs/prd-<feature>.md

   **Research:** @docs/research-<feature>.md
   ```

2. In the repo-root `CLAUDE.md` (not `apps/web/CLAUDE.md` or `apps/api/CLAUDE.md`), add or
   update an `## Active feature plans` section (create it, just above
   `## Keeping documentation in sync`, if it doesn't exist yet) with one line per active
   plan:

   ```
   - `docs/plan-<feature>.md` (PRD: `docs/prd-<feature>.md`; research: `docs/research-<feature>.md`) — <one-line description>.
   ```

   This section tracks only plans that are still being implemented. If the plan this
   research is for has already fully shipped, or another entry in the section refers to a
   plan that has, remove that entry rather than letting the list grow indefinitely.
