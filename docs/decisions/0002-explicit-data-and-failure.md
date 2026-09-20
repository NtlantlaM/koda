# 0002: Explicit data and failure

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** user principles; Q11-specific nominality, signatures, inference, null/string/equality rules and deferrals are now accepted in [ADR 0007](0007-q11-type-boundaries.md). Numeric behavior, mutation/aliasing, Result enforcement, and unrelated scope remain **AWAITING DECISION** under their existing questions.
Date: 2026-09-19

## Context

Readable production programs need predictable data shapes, visible mutation, and recoverable errors that callers can inspect.

## Decision

Use strong static typing with local inference and explicit function signatures. `type` defines nominal application records. Bindings default to immutable; `mut` makes reassignment explicit. `T?` makes nullability visible. Closed enums support associated data and exhaustive matching. Recoverable failure uses `Result<T, E>` without automatic propagation or unwrapping.

## Alternatives

Structural records would ease some interop but blur domain distinctions. Implicit nullability and exceptions reduce local annotations but hide caller obligations. Default mutation makes state changes harder to audit.

## Consequences

Programs may be more verbose, especially when matching errors. Diagnostics can explain missing alternatives and unsafe nullable use precisely. Numeric rules, record aliasing, and unused Result enforcement require Q02–Q04 before compiler implementation. Traits are a future composition mechanism, not a prerequisite for v0.1 generic identity/data functions.
