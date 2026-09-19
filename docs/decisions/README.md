# Architecture decision records

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

ADRs preserve rationale. Status uses the same four values as the [feature register](../design/feature-status.md). ACCEPTED decisions may still delegate explicitly named details to open questions. Replacing a decision requires a new ADR with a `Supersedes` reference; keep the original for history.

| Record | Status | Decision |
| --- | --- | --- |
| [0001](0001-standalone-language-and-bootstrap.md) | ACCEPTED | Standalone semantics, TypeScript bootstrap, JavaScript/Node target |
| [0002](0002-explicit-data-and-failure.md) | ACCEPTED | Strong types, immutable defaults, nullable values, explicit results |
| [0003](0003-persistence-boundary.md) | ACCEPTED | Separate entities and explicit persistence effects |
| [0004](0004-diagnostics-and-toolchain.md) | ACCEPTED | Shared diagnostics and a single toolchain |
| [0005](0005-small-v01-and-library-boundaries.md) | EXPERIMENTAL / AWAITING DECISION | Small v0.1 and library/platform separation |
| [0006](0006-structured-concurrency-direction.md) | ACCEPTED | Structured concurrency direction; defer implementation |

## New ADR template

```text
# NNNN: Decision title
Status: ACCEPTED | EXPERIMENTAL | LATER | REJECTED
Date: YYYY-MM-DD
Supersedes: optional record

## Context
What concrete problem needs a decision?
## Decision
What is decided, and what remains unresolved?
## Alternatives
Which credible alternatives were considered?
## Consequences
Benefits, costs, limitations, and required follow-up.
```
