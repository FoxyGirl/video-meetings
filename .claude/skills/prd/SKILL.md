---
name: prd
description: I create a PRD document for a feature using the standard project structure. I use it when I need to describe the requirements for a new feature before implementation.
---

# PRD Generator

Create a PRD (PRoduct Requirements Document) for the following feature: $ARGUMENTS

Save the result to the file 'docs/prd-$ARGUMENTS.md' (use the English translation and kebab-case)

If there is no /docs folder, create one.

## Document Structure

# PRD: {feature name}

**Date**: {current date}
**Status**: Draft

## Purpose

One or two sentences explaining what the user needs and why.

## User Scenarios

- User {action} -> {Result}

## In scope

What's included in the feature - a specific list

## Out of scope

What we're explicitly not doing in this iteration

## Technical limitations

A known limitation that needs to be addressed

## Acceptance Criteria

- [ ] Criteria 1
- [ ] Criteria 2

## Rules

- Be specific - no fluff
- Done criteria must be verifiable
- Done criteria must not be described as how to implement - only what and why
- If the description is short, ask clarifying questions to ensure full understanding before creating the file
