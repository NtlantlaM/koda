# 0005: Keep v0.1 small and platform concepts in libraries

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **EXPERIMENTAL** release-scope proposal; **AWAITING DECISION**. The user-supplied prohibition on framework grammar remains accepted.
Date: 2026-09-19

## Context

A first implementation must demonstrate an independently checked language without accumulating a framework, ORM, and distributed runtime at once.

## Decision

v0.1 covers synchronous functions, nominal records, generics, nullable values, Result, enums/matching, modules, a narrow checked npm boundary, and a minimal unified local toolchain. Persistence execution, trait implementation, async execution, registry publishing, and additional backends are later work. Reject framework-specific core grammar, deep inheritance, TypeScript passthrough, and unnecessary metaprogramming in this baseline.

## Alternatives

A full-stack first release would demonstrate the long-term vision but make language correctness difficult to isolate. Omitting typing and diagnostics from a quick transpiler would miss the project's core purpose.

## Consequences

v0.1 is useful for proving the language model and tooling, not a claim that the complete production platform exists. Each later feature needs a motivating example, coherent semantics, diagnostic design, and a cost argument. The roadmap controls release scope; experimental examples do not expand it.
