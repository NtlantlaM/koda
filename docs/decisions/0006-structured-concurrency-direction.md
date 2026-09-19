# 0006: Concurrent work has a structured lifetime

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** direction; syntax **EXPERIMENTAL**; implementation **LATER**
Date: 2026-09-19

## Context

Production programs need concurrent I/O without orphaned work, invisible failures, or unclear resource lifetimes.

## Decision

Future task execution belongs to an explicit scope. A scope must not complete while its children are still running. Cancellation and failures propagate according to a documented scope policy; detached fire-and-forget tasks are outside the accepted direction. No concurrency syntax is part of v0.1.

## Alternatives

Unstructured promises map directly to JavaScript but permit tasks to outlive their owner. Blocking all concurrency would prevent important production use cases later.

## Consequences

The future runtime needs joining, cancellation, cleanup, and error aggregation semantics, not merely Promise syntax sugar. Q10 must decide those rules and interaction with Result and foreign calls. The experimental example is illustrative and must not be compiled as v0.1 source.
