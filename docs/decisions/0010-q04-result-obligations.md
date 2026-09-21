# ADR 0010: Q04 Result obligations and beginner-first failure experience

- Status: ACCEPTED
- Date: 2026-09-20
- Decision: Q04 Option B with beginner-first deterministic diagnostics and optional AI assistance
- Depends on: ADR 0008 (Q02), ADR 0009 (Q03)
- Informs: Q01, Q06, Q07, Q10

## Context

Koda already requires explicit `Result<T, E>` for recoverable failures. The remaining question is how strongly callers must acknowledge those failures and how that obligation should feel to a beginner.

Warnings are too easy for humans and generated code to ignore. Full linear/ownership tracking would conflict with Koda's v0.1 simplicity goals. Koda also intends AI-assisted development, but correctness cannot depend on an AI service.

## Decision

Koda adopts local must-handle Result enforcement.

A reachable bare Result expression is an error. A Result stored in a local cannot be silently overwritten or abandoned at a reachable exit while it remains locally unhandled. Explicit matching/inspection handles it. Returning, passing, or storing it transfers local responsibility; v0.1 does not claim whole-program proof that business intent was eventually satisfied.

There is no dedicated silent-discard escape in v0.1. A developer who intentionally ignores an outcome may use an explicit match that makes the alternatives visible.

Initial semantics require explicit handling/return rather than implicit propagation. Any concise propagation syntax is a later Q01 spelling decision and must preserve visible failure behavior.

Expected failures use Result. Fatal invariant/compiler defects and Q02's accepted checked arithmetic faults are not automatically transformed into Result.

## Beginner-first diagnostics

Result diagnostics must answer, in ordinary language:

1. What happened?
2. Where did it happen?
3. Why does Koda care?
4. What can the developer do next?

The primary rendering should not require knowledge of compiler/type-theory jargon. Stable diagnostic codes remain available for search, tooling, tests, and deeper explanations.

A typical diagnostic for an ignored Result should communicate that the operation can succeed or fail, the program has not chosen what to do on failure, and show concrete handling/transfer choices.

## AI assistance

AI assistance is optional and consumes compiler-produced structured diagnostics. The compiler is always the authority on validity.

AI may explain diagnostics in project context, teach concepts, and propose repairs. It may not suppress errors, redefine correctness, or be required for compilation/checking/testing/formatting/baseline explanations.

Mechanically safe edits are classified by deterministic tooling. AI does not get to label a semantic change as safe merely because it appears plausible.

Exact AI commands, providers, configuration, privacy/consent rules, context selection, and patch-application UX remain Q07/platform decisions.

## Principles

> The compiler must know what is wrong. AI may help explain what it means.

> Every Koda error should answer: What happened? Where? Why? What can I do next?

Diagnostics use progressive disclosure: concise actionable output first, deterministic deeper explanation second, optional AI assistance third.

## Consequences

- Generated code cannot compile while silently dropping a locally visible recoverable failure.
- Beginners receive explanations rather than must-use/linear-value terminology.
- Compiler data structures must support stable machine-readable diagnostics and suggested edits.
- Result flow checking requires moderate local control/data-flow analysis.
- AI integrations can evolve independently of language correctness.
- Koda remains usable offline without AI.

## Accepted follow-up details

Approver: repository owner/user, by explicit instruction, 2026-09-21. This fills
in a detail this decision left to integration; it supersedes nothing above.

- **The prelude Result payload field names are `value` and `error`**, giving
  `Ok(value: T)` and `Err(error: E)`. ADR 0008 had left "Q04/Q06 error names,
  payloads and boundary wrapping" open; this settles the two field names only,
  and chooses nothing about foreign error representation or boundary wrapping.

- **Constructors are unqualified and positional**: `Ok(x)`, `Err(e)`.
  `Result.Ok(...)` is not a v0.1 spelling.

### Implementation staging

Result is delivered in two slices. **Slice 2B** implements Result values,
construction and matching. **Slice 2C** implements the must-handle obligation
analysis this ADR requires. Both have landed.

### 2026-09-21 - must-handle enforcement rules

Approver: repository owner/user, by explicit Slice 2C authorization. These
settle how the accepted obligation is enforced; they do not change what is
owed.

- **Discharge through `match` requires both alternatives to be visible.** A
  match discharges a Result obligation only when its reachable arms explicitly
  expose `Ok` and `Err`. `Ok(_)` and `Err(_)` qualify, because both
  alternatives are named even though the payloads are deliberately ignored.
  `Ok(value)` with a trailing `_`, and a lone `_`, do **not** discharge.
  Exhaustiveness and obligation discharge are separate properties: a wildcard
  may make a match exhaustive without making the failure visible.

- **A Result parameter begins the function with an outstanding obligation.**
  Otherwise a one-line function taking a Result and ignoring it would be the
  reusable silent-discard escape this decision forbids.

- **Binding an outstanding Result into another binding transfers it.** After
  `second = first`, the responsibility belongs to `second`. Obligations are
  never duplicated, shared, or prohibited from being copied, and no ownership
  or borrowing machinery is introduced.

- **An outstanding Result may not be overwritten.** Rebinding a `mut` Result
  that has already been discharged is allowed and starts a fresh obligation.

- **Obligations are checked at every scope exit**, not only at the end of a
  function, and at every `return`.

- **A binding whose own type is `Result<T, E>?` carries an obligation**,
  discharged by the nullable match that exposes absence and presence. The
  bound present value has direct Result type and so acquires its own
  obligation.

### Known enforcement limitation

Enforcement tracks a binding whose **own** type is `Result<T, E>` or
`Result<T, E>?`. Storing a Result into a record field or enum payload
transfers the local obligation and tracking stops there, so a container
holding an unhandled Result can currently be dropped without a diagnostic.

**This is an implementation limitation, not a permitted discard.** This
decision still requires that failure be handled; the compiler does not yet
prove it in that position. Closing the gap needs obligation tracking through
containers, which is deliberately outside the accepted slice boundary.

Introducing loops will likewise require extending the analysis to a fixpoint;
the current language has none.

## Deferrals

- exact match/propagation syntax (Q01)
- final diagnostic codes/rendering/schema and CLI exit contracts (Q07)
- exact `koda explain`, AI and safe-fix command spelling (Q07)
- AI provider/model selection and configuration
- source-context privacy/consent and network policy
- automatic patch review/application UX
- whole-program proof of eventual Result handling
- affine/linear Result ownership
