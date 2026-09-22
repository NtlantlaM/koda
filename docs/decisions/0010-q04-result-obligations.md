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

### Historical Slice 2C enforcement limitation

Slice 2C enforcement tracked a binding whose **own** type is `Result<T, E>` or
`Result<T, E>?`. Storing a Result into a record field or enum payload
transfers the local obligation and tracking stops there, so a container
holding an unhandled Result could then be dropped without a diagnostic.

**This is an implementation limitation, not a permitted discard.** This
decision required that failure be handled; Slice 2C did not prove it in that
position. Tracking through containers was outside its accepted boundary. The
accepted Slice 3B follow-up below closes that historical gap.

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

## Accepted Slice 3B structural responsibility follow-up

Accepted by explicit human Slice 3B authorization. These rules extend local
responsibility through containers; they do not introduce ownership or moves.

- Derive shapes from instantiated stored fields/payloads, never generic arguments
  alone. Record paths are independent; enum payloads are variant-dependent.
- Transfer retires outstanding responsibility at the selected source subtree.
  Values remain readable. Receiving bindings, assignments, fields, payloads,
  patterns, parameters and call results acquire fresh responsibility, including
  when the source was already handled/transferred. There is no alias graph.
- The earlier phrase "obligations are never duplicated" prohibits retaining the
  transferred obligation at both ends; it does not prohibit independent receiver
  renewal. Storing one Result twice creates two receiving responsibilities.
- Handling the outer Result requires visible Ok/Err alternatives and does not
  acknowledge nested Results in either payload. Wildcards preserve hidden
  responsibility under the named source or an analysis-only temporary.
- Nullable stages remain distinct from present payload responsibility. Known
  absence has no contained responsibility, but does not remove the existing
  requirement to acknowledge a Result? binding initialized with null.
- Known enum constructions carry their actual alternative; unknown values retain
  possible alternatives until matching. Impossible alternatives acquire no
  phantom payload responsibilities.
- Parameters acquire type-derived responsibility. Returns transfer outward;
  callers renew from declared types, without handled-state effect summaries.
- Temporary projections retain unselected responsibilities. Block/branch tails
  transport their values; discarded calls and residuals are diagnosed.
- Replacement evaluates/transfers the RHS before checking the old generation,
  then installs a fresh generation. Every outstanding sibling prevents replacement.
- A join retains responsibility outstanding on any continuing path where it
  exists. Absence differs from handling. Both && and || respect skipped RHS paths.
- This is a local guarantee, not global provenance or proof of eventual/exactly-once
  handling. No ownership, borrowing, lifetimes, runtime state or Q08 choice follows.

The container limitation above records Slice 2C history. Slice 3B closes it only
after all execution-path, structural and conditional-payload stages validate.
See [Slice 3B](../implementation/slice-3b.md).

## 2026-09-22 — accepted abstract type-parameter responsibility (Slice 4A)

Approver: repository owner/user, by explicit Slice 4A decision. This extends the
must-handle rule to generic functions. It introduces no effect system and
weakens nothing already accepted.

### The problem this closes

A generic body cannot see its type arguments. Before this decision an
unconstrained type parameter carried no responsibility at all, while a call site
discharged the caller by transferring each argument. A two-line generic wrapper
would therefore have erased a Result's responsibility:

```ko
fn ignore<T>(x: T) -> Unit { }

ignore<Result<Int, String>>(operation())    // responsibility lost
```

The non-generic equivalent is already rejected, so generic functions would have
reopened, through a wrapper, exactly the reusable silent-discard escape this ADR
forbids.

### The accepted rule

> A value whose type is an unconstrained type parameter carries an **opaque
> responsibility**. It may be returned, passed onward, or stored in a field or
> payload that preserves responsibility, under the ordinary transfer rules. It
> **cannot be handled**, because an abstract type parameter cannot be matched.

Consequences:

- `fn identity<T>(x: T) -> T { x }` is accepted; the value is handed on by the
  return.
- `fn ignore<T>(x: T) -> Unit { }` is **rejected at its declaration**, once.
- The rejection stands even where an instantiation would carry nothing, such as
  `T = Int`. The conservative cost is accepted for v0.1.
- Responsibility still flows only through **stored members**. `Phantom<T>` with
  no fields carries nothing even at `Phantom<Result<Int, String>>`; `Box<T>`
  carries its `value`; enum payloads stay variant-sensitive.
- An outer `Result` and a potentially responsibility-bearing `T` inside it are
  separate responsibilities, as in `fn wrap<T>(x: T) -> Result<T, E> { Ok(x) }`.
- Receiver renewal is unchanged: reading a value twice produces two independent
  responsibilities, both of which must be discharged.

### Explicitly not introduced

Obligation or effect summaries, call-site body summaries, polymorphic effect
inference, ownership, moves, and runtime obligation tracking. The analysis stays
local to one function and derives everything from declared types.

### Reversibility

This rule is conservative, so it can be relaxed later — by a more precise
parametric model, or by a deliberate-ignore form — without weakening any
guarantee that holds today. Starting permissive would not have been reversible.

The diagnostic reuses `KODA-T0012` and explains that the value's type is an
unconstrained type parameter, so Koda cannot tell whether it holds an outcome.
It does not suggest matching the value.

## 2026-09-22 — accepted collective responsibility for lists (Slice 5)

Approver: repository owner/user, by explicit Slice 5 decision. This extends the
must-handle rule to a variable-length collection. It introduces no effect
system and weakens nothing already accepted.

### The representation problem

Structural responsibility enumerates statically known members: record fields by
index, enum payloads by variant. A list has as many elements at runtime as it
has, and no per-element key exists to enumerate.

### The accepted representation

> A list carries **one collective responsibility standing for all of its
> elements**. It bears responsibility exactly when its element type does. A
> finite literal and a list returned by a function use the same representation;
> literal elements are never tracked as separate paths.

Diagnostic paths render the collective element as `[]`, so a nested case reads
`results[].value`.

### The three rules

**R1 — normal completion discharges.** A `for` loop visits every element, so a
loop that reaches normal completion, with the binding discharged on every path
that gets there, discharges the list's collective responsibility. An empty list
discharges it vacuously, which is correct: there was nothing to visit.

**R2 — reading one element does not discharge the list.** `get` renews a
responsibility for the value it returns and leaves the list responsible for
everything else. It is deliberately **not** modelled as a field-style transfer
of a child, because that would discharge the whole collection on one read and
silently lose every other element. `length()` and `isEmpty()` observe only
collection metadata, inspect no element, and discharge nothing.

**R3 — an early `return` discharges nothing.** Leaving a loop before normal
completion proves nothing about the elements not yet visited, so the list
remains outstanding on that path. This is why `break` and `continue` are
deferred: they create the same partial-visit edge with a less obvious
diagnostic.

Repeated iteration renews on each read, exactly as every other repeated read
already does. Responsibility is compiler accounting, not runtime identity, so
two loops over one list must each account for what they read.

### Provisional asymmetry — must be revisited

Compiler-known list intrinsics may carry responsibility behaviour that a
user-written generic function cannot express. `items.length()` is accepted on a
`List<Result<…>>` receiver because the compiler knows it reads no element,
while an identical user-written `fn count<T>(items: List<T>) -> Int` remains
rejected under the Slice 4A abstract-parameter rule.

**This asymmetry is PROVISIONAL v0.1 behaviour. It is not Koda's permanent
generic-effect design.** It exists because an intrinsic comes with an
implementation the compiler can reason about, and Koda currently offers users no
way to state the same property.

It **must** be revisited before any of:

- a broad `List` standard library,
- `map`, `filter`, `reduce` or similar transformations,
- first-class or named-function transformation APIs,
- significant user-defined generic collection abstractions.

Slice 5 deliberately introduces no effect summaries, no does-not-consume
annotations, no ownership, no moves and no polymorphic effect inference.

## 2026-09-22 — accepted responsibility for list construction (Slice 6A)

Approver: repository owner/user, by explicit Slice 6A decision. This introduces
no new responsibility machinery; it records which existing rule `append` falls
under, and why.

### Observers and producers

The compiler-known list operations divide in two, and the division is load
bearing:

- **Observers** — `length`, `isEmpty`, `get`. They read the receiver without
  accounting for it. Slice 5's R2 keeps the list responsible for every element
  it holds, because reading one element proves nothing about the others.
- **Producer** — `append`. It accounts for the list *and* the value, and
  returns a new list that carries both. The new list is responsible for
  everything the old one held.

### `append` uses the ordinary rule

> `append` takes its receiver and its value the way any operation takes what it
> reads, and the list it returns renews responsibility for both.

This is the existing rule that a read is accounted for and the destination
renews. It is **not** ownership, **not** a move, and **not** an append-specific
exception to the overwrite rule:

- The original list stays readable. Reading it again renews a fresh
  responsibility, which must then be discharged on its own:

  ```ko
  ys = xs.append(makeResult())
  for r in xs { handle(r) }     // accepted - the re-read renews
  for r in ys { handle(r) }     // and ys must be handled too
  ```

- Reading the original again and *ignoring* it is still reported. Nothing
  disappears merely because `append` read the list.
- `mut xs = xs.append(v)` is accepted without a special case: the right-hand
  side accounts for the old generation before the rebinding happens, so there is
  no outstanding previous generation to overwrite. The same holds inside a loop.
- An accumulated list that is never handled is still reported.

### No fixed point is required

Accumulation in a loop needs no iteration-count reasoning. Each step accounts
for the old generation and renews a new one, so the abstract state after one
analysed pass is the state after any number of runtime iterations. The existing
single-pass flow analysis is sufficient, and Slice 5's R3 still rejects an early
`return` out of an accumulating loop.

Slice 6A introduces no ownership, no moves, no runtime responsibility tracking
and no effect summaries. Model B remains unchanged and still provisional.
