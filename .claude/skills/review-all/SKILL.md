---
name: review-all
description: Runs a full code review through three parallel agents: `performance-reviewer`, `security-reviewer`, and `test-coverage-reviewer`. Returns a combined report of all three agents' findings.
model: opus 
---

Run three subagents in parallel using Task tool:

1. security-reviewer: Reviews the code for security issues, including but not limited to SQL injection, XSS, CSRF, and other common vulnerabilities. Provides recommendations for fixing any issues found.
2. performance-reviewer: Reviews the code for performance issues, including but not limited to N+1 queries, missing indexes, unnecessary re-fetches/re-renders, and bundle/asset bloat. Provides recommendations for fixing any issues found.
3. test-coverage-reviewer: Reviews the code for test coverage issues, including but not limited to missing unit tests, integration tests, and end-to-end tests. Provides recommendations for improving test coverage.

Run all three simultaneously, and when they're all finished, synthesize the results into a single report.
