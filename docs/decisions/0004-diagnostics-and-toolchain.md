# 0004: Diagnostics and one toolchain are language infrastructure

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** user principles for diagnostics and one toolchain; stable-code/schema/command contracts are **AWAITING DECISION** under Q05 and Q07.
Date: 2026-09-19

## Context

Humans, editors, CI, and optional AI clients need the same reliable account of why a program is invalid. Competing formatting and package conventions create avoidable friction.

## Decision

Use structured diagnostics with stable codes and source spans, rendered for either people or machines. Deliver one CLI with one formatter, test runner, and package manager. Share compiler semantics across all commands. Optional AI tools may consume diagnostics and propose edits but cannot change acceptance rules.

## Alternatives

Unstructured error strings are easy to start with but brittle for tooling. Independent tools reduce central scope but risk divergent semantics and conventions.

## Consequences

Source spans, recovery, and diagnostics are designed before advanced features. Package functionality can be staged behind one CLI; a public registry is not required for v0.1. Exact CLI, JSON, test, and formatting contracts remain Q07. Stable diagnostic codes require review when changed.
