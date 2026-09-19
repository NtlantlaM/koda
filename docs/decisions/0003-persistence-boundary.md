# 0003: Persistence is explicit and distinct from ordinary data

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** principle; entity API remains **EXPERIMENTAL**
Date: 2026-09-19

## Context

Database-backed application data needs clear identity and effect boundaries without turning normal data construction into hidden I/O.

## Decision

Reserve `entity` for persistent database-backed data and keep `type` for ordinary application values. Database writes must be explicit, with `User.create { ... }` as an illustrative intended idiom. No implicit save-on-assignment, lazy field-access queries, or automatic schema changes. Vendor-specific storage and framework concepts belong in adapters and tools.

## Alternatives

Implicit active-record persistence hides effects. Treating every record as persistent couples ordinary data to storage. Implementing a complete ORM in the bootstrap compiler would dominate v0.1.

## Consequences

The entity distinction is part of the direction, but executable persistence is deferred. Q09 must settle identity, capabilities, transactions, schema ownership, and the brace-call syntax before implementation. Merely recognizing the reserved word must produce an unsupported-feature diagnostic in v0.1, not partial persistence behavior.
