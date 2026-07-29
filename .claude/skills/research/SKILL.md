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
