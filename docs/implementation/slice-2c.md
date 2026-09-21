# Compiler slice 2C — Result must-handle analysis

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

Slice 2C enforces [ADR 0010](../decisions/0010-q04-result-obligations.md)'s
must-handle rule over the Result values [slice 2B](slice-2b.md) introduced. A
Result that may fail can no longer be dropped, abandoned or overwritten without
someone looking at it.

```text
.ko source
  -> lexer / parser / AST      (unchanged)
  -> resolver / type checker   + Result-specific discard message
  -> typed IR                  + IRModule.resultDeclarationId
  -> OBLIGATION PASS           <- new, runs only when checking succeeded
  -> JavaScript / runtime      (unchanged)
```

## Accepted language behaviour

### A Result may not be discarded

```ko
sendEmail(user)         // rejected: the failure is never seen
```

### Binding does not discharge

`result = sendEmail(user)` creates an outstanding responsibility. It is
discharged by handling, returning, passing onward, or storing.

### Discharge through `match` needs both alternatives visible

```ko
match result {
    Ok(value) => ...
    Err(error) => ...      // discharges
}
```

`Ok(_)` with `Err(_)` also discharges — both alternatives are named, the
payloads are deliberately ignored. These do **not** discharge:

```ko
match result { Ok(value) => ...  _ => ... }     // Err never made visible
match result { _ => ... }
```

Exhaustiveness and discharge are separate properties. A wildcard can make a
match exhaustive without making the failure visible.

### Parameters begin outstanding

```ko
fn ignore(result: Result<Int, E>) -> Unit { }   // rejected
```

Otherwise this two-line function would be a reusable silent-discard escape,
which ADR 0010 forbids.

### Binding transfers

After `second = first`, the responsibility belongs to `second`. Handling
`first` no longer satisfies it. Obligations are never duplicated, shared or
forbidden from being copied.

### Overwrite is rejected; rebinding after discharge is not

```ko
mut r = op()
r = op()                  // rejected: the first outcome was never seen

mut r = op()
match r { Ok(_) => {}  Err(_) => {} }
r = op()                  // fine: starts a fresh obligation
```

### Branches, scope exits and returns

A Result handled on only one branch stays outstanding after the join; handled on
one branch and transferred on the other is discharged. Obligations are checked
at **every scope exit**, not only at the end of a function, and at every
`return`.

### Nested and nullable Result

An `Ok` payload binding whose own type is a Result acquires its own obligation.
A `Result<T, E>?` binding carries an obligation discharged by the nullable match
that exposes absence and presence; the bound present value then carries its own.

## Implementation detail

**Architecture.** A separate pass in `check/obligations.ts`, run from
`compile.ts` only when ordinary checking produced no errors. That ordering
matters: the pass then sees only real types and no recovery nodes, so it never
has to ask whether a node is genuine. IR statement order is source order, which
makes diagnostics deterministic with no sorting.

**No CFG, no ownership, no borrowing, no lifetimes, no fixpoint.** The language
has no loops, so a single ordered walk is complete.

**Identity.** Obligations are keyed by `LocalSymbol.id` — never by name, never
by reference count. Three existing properties carry the weight: no shadowing
means a name resolves to one symbol; no observable reference identity means
there is no runtime aliasing to model; immutable values mean a binding's
contents cannot change underneath the analysis.

**State.**

```
Outstanding(since) | Handled(at) | Transferred(at, to)
```

Both discharged states collapse at a join; they stay apart so a diagnostic can
say which happened.

**Join.** Discharged on every contributing path means discharged; otherwise the
responsibility survives. A branch that cannot reach the join — `IRBlock.type` is
`Never` — does not contribute. An `if` without an `else` contributes the
incoming state as its second path.

**The four statement kinds are exactly the four obligation events**, which is
why the IR needed no restructuring:

| IR node | Event |
| --- | --- |
| `IREval` with Result type | discard |
| `IRDeclare` | transfer from the source, then a new obligation |
| `IRAssign` | overwrite check, then a fresh obligation |
| `IRReturn` | transfer, then check every outstanding obligation |

**Transfer sites** are call arguments, record construction entries, enum and
Result payloads, return values, and block tails.

**One checker integration point.** A Result where `Unit` is expected is a
discarded Result, so the checker reports `KODA-T0005` rather than
`expected Unit, found Result<…>`. That is the diagnostic-ordering integration
the slice authorization permits; the analysis itself stays in its own pass.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| Three distinct codes rather than one shared code | The fixes genuinely differ: handle it, handle it before leaving scope, handle it before reassigning. | **Q07** |
| Each obligation is reported once, then marked discharged | Avoids repeating the same responsibility at every enclosing exit. | none (presentation) |
| Diagnostics ordered by symbol id, which is allocation order and therefore source order | Deterministic without a sort. | none |

## Known limitation — container tracking

Tracking follows a binding whose **own** type is `Result<T, E>` or
`Result<T, E>?`. Storing a Result into a record field or enum payload transfers
the local obligation and tracking stops there:

```ko
w = Wrapper { outcome: operation() }    // obligation transfers into w
// dropping w is not currently diagnosed
```

**This is an implementation limitation, not a permitted discard.** ADR 0010
still requires that failure be handled; the compiler does not yet prove it in
that position. Closing the gap needs obligation tracking through containers,
deliberately outside this slice.

Likewise, introducing loops will require extending the analysis to a fixpoint.
The current language has none.

## Deferred

Everything outside must-handle: ownership, borrowing, lifetimes, deep container
tracking, loop fixpoints, a silent-discard escape syntax, direct Result variant
patterns through a nullable scrutinee, and any change to Result's runtime
representation.

## Diagnostics

| Code | Condition |
| --- | --- |
| `KODA-T0005` | a discarded Result expression, or a Result where `Unit` is expected |
| `KODA-T0012` *(candidate)* | an outstanding Result leaving its scope, or live at a `return` |
| `KODA-T0013` *(candidate)* | an outstanding Result overwritten before being handled |

Each names where the Result became outstanding, why Koda insists, and how to
discharge it. None suggests a wildcard as a fix.

```text
error[KODA-T0012]: 'r' still holds an outcome nobody has looked at
   |     this is where it goes out of scope
note: 'r' was given a Result here
note: a Result says an operation can succeed or fail; Koda will not let the failure pass silently
note: handle it with `match r { Ok(value) => ..., Err(error) => ... }`
note: or return it, or pass it to something that takes responsibility
```

## Ambiguity discovered

**None.** The accepted rules covered every case the implementation reached, and
no stop condition was triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/result-obligations.ko` | every accepted way to discharge: explicit `Ok`/`Err`, ignored payloads, parameter handled and forwarded, rebinding after discharge, both branches handling, handle-or-transfer, early-return transfer, call-argument and return transfer both direct and via a local, alias transfer, nested inner handled, the two-step nullable shape, and storage into a record field and an enum payload |
| `tests/types/result-obligations.ko` | thirteen rejections: bare discard, bound-unhandled, overwrite, one-branch handling, early-return abandonment, ignored parameter, alias source handled, nested inner unhandled, nullable unhandled, nullable present unhandled, `Ok` + wildcard, wildcard alone, branch-local unhandled |

`tests/execution/result.ko` was rewritten: its `succeeded` helper used
`Ok(n) => …, _ => …`, which no longer discharges. The rule was not weakened to
preserve it.

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/result-obligations.ko
```
