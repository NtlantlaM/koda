# Compiler slice 1B — match and enum patterns

> **This document records an implementation, not a decision.** Nothing here
> changes a feature's maturity or any question's decision state. Accepted
> language behaviour, implementation detail, provisional choices, deferrals and
> open ambiguities are kept in separate sections on purpose.

[Slice 1C](slice-1c.md) builds on this one by adding nullability.

Slice 1B makes the enum values from [slice 1A](slice-1a.md) inspectable. It adds
`match` expressions, qualified variant patterns, positional payload patterns,
pattern-local bindings, the `_` catch-all, exhaustiveness checking, unreachable
arm detection and match result typing.

```text
.ko source
  -> lexer            (unchanged; `=>` and `_` were already tokens)
  -> parser           + match expressions, patterns, arm bodies
  -> AST              + MatchExpression, MatchArm, Pattern
  -> resolver/checker + scrutinee resolution, coverage, arm scopes, arm typing
  -> typed IR         + IRMatch, IRMatchArm
  -> JavaScript       + a tag-test chain over a single scrutinee temporary
  -> runtime          (unchanged)
```

## Accepted language behaviour

### Match is one construct, used as a value or as a statement

ADR 0011 gives Koda a single `match`. There is no statement-only variant. Used
where a value is wanted it produces one; used as a statement it is checked
against `Unit`, exactly as `if` is.

```ko
text = match status {
    PaymentStatus.Pending => "Waiting"
    PaymentStatus.Paid(id) => id
    PaymentStatus.Failed(reason) => reason
}

match status {
    PaymentStatus.Pending => print("Waiting")
    PaymentStatus.Paid(id) => print(id)
    PaymentStatus.Failed(reason) => print(reason)
}
```

### Variants are qualified; payload patterns are positional

ADR 0011 qualifies user enum variants, and its 2026-09-21 follow-up fixes
payload construction as positional with pattern bindings that are free names.
Both hold here: a bare `One` is rejected, and `PaymentStatus.Paid(id)` binds
`id` whatever the declared field is called.

### A pattern binding is local to its arm, and typed by the declaration

`Paid(transactionId: String)` gives `PaymentStatus.Paid(id)` a binding `id` of
type `String`, visible only inside that arm. ADR 0007's no-shadowing rule
applies: a binding may not reuse the name of a visible local, parameter,
function, type or enum, and two bindings in one pattern may not repeat a name.

### Arms are considered in order, and unreachable arms are diagnosed

docs/spec/type-system.md requires exactly this. Three deterministic cases are
detected:

- an arm after a `_` that already matches everything;
- a second arm for a variant already matched above;
- a `_` placed after every variant is already covered.

### Exhaustiveness

A match over an enum must cover every variant or end in `_`. A missing variant
is `KODA-T0003`, and the diagnostic names each one:

```text
error[KODA-T0003]: this match does not cover one case of 'PaymentStatus'
   |     missing PaymentStatus.Failed
note: a match covers every variant, so a value can never fall through without an answer
```

No default branch is ever inserted.

### All reachable arms agree on a type

docs/spec/type-system.md: "All value-producing arms must agree on a type." There
is no union type and no implicit widening. An arm that always returns has type
`Never` and does not constrain the others.

### Payload arity must be correct

"Each variant's payload must have the correct arity." A pattern naming too few
or too many values is `KODA-T0006`, as is writing `PaymentStatus.Paid` bare when
it carries a value.

## Implementation detail

**Scrutinee evaluated exactly once.** docs/architecture/compiler.md requires a
side-effecting operand to run exactly once when a match is lowered, so the
emitter binds the scrutinee to a temporary before testing any arm:

```js
let $t0;
const $t1 = k_status;
if ($t1.$tag === "Pending") {
  $t0 = "Waiting";
} else if ($t1.$tag === "Paid") {
  const k_id = $t1.k_transactionId;
  $t0 = ("" + "Paid: " + k_id);
} else if ($t1.$tag === "Failed") {
  const k_reason = $t1.k_reason;
  $t0 = ("" + "Failed: " + k_reason);
}
```

A catch-all becomes the final `else`. A match in statement position skips the
result temporary entirely.

**Exhaustiveness algorithm.** Deliberately the simple one the accepted pattern
model allows, not a general usefulness algorithm. Walking the arms in order it
keeps a map of covered variant names and the span of the first `_` reached. An
arm is unreachable if a `_` was already reached, or if its variant is already in
the map. At the end the match is exhaustive when a `_` was reached or the map
covers every declared variant; otherwise the uncovered variants are reported by
name. Because patterns are one level deep, coverage is a set of names and no
witness construction is needed.

**Arm scoping.** Each arm gets its own scope, pushed before its bindings are
declared and popped after its body, so nothing leaks.

**Error recovery.** A pattern that fails still declares the names it wrote, so
the arm body does not report each of them as unresolved on top of the real
error; and a match containing an unresolved pattern skips the exhaustiveness
report, because its coverage is unknown.

## Provisional implementation choices

None is an accepted decision. Each names the question that owns it.

| Choice | Made here | Owner |
| --- | --- | --- |
| An unreachable arm is an **error**, not a warning | docs/spec/type-system.md requires unreachable arms to be diagnosed but does not fix a severity. Error matches how this compiler treats every other static mistake; if the intended policy is a warning, only the severity changes. | Specification completion |
| No runtime guard on the fall-through of an exhaustive match | Exhaustiveness is proved statically, so a guard in a final `else` would itself be unreachable. docs/architecture/compiler.md limits the runtime to behaviour Koda semantics require. | **Q08** |
| Enum values keep the `$tag` layout from slice 1A | Match reads that tag; the layout stays provisional. | **Q08** |

Everything provisional in [slice 0](slice-0.md#provisional-choices) and
[slice 1A](slice-1a.md#provisional-implementation-choices) remains so, including
the single module-level namespace, which is still **not ratified**.

## Deferred

Accepted features this slice deliberately leaves alone:

| Feature | Note |
| --- | --- |
| Matching a `Bool` | docs/spec/type-system.md extends exhaustiveness to `Bool`; the scrutinee must be an enum here, and anything else is `KODA-U0001`. |
| Matching a nullable, and `null` patterns | Needs `T?`, which is out of scope. |
| A bare name as a whole pattern (binding catch-all) | ADR 0011 accepts it; only `_` is implemented, and the diagnostic says so. |
| Nested patterns inside a payload | A payload entry is a name or `_`. |
| Guards | Explicitly deferred by ADR 0011. |
| Record destructuring | Not part of the accepted pattern model yet. |
| `Result`, `Ok`, `Err` | Needs generics. |
| Matching open domains (numbers, strings) | Requires a catch-all binding, which is the deferred bare-name pattern. |

## Diagnostics

| Code | Condition |
| --- | --- |
| `KODA-T0003` | a match does not cover every variant; names the missing ones |
| `KODA-T0010` *(candidate)* | an arm can never run: after `_`, a repeated variant, or a redundant `_` |
| `KODA-T0006` | a payload pattern names the wrong number of values |
| `KODA-T0009` | the enum has no variant with that name |
| `KODA-T0001` | a variant of a different enum, or arms producing different types |
| `KODA-N0002` | a pattern binding shadows or repeats a name |
| `KODA-U0001` | a non-enum scrutinee, a bare-name pattern, a nested payload pattern |

`KODA-T0003` was already in docs/spec/diagnostics.md's candidate table.
`KODA-T0010` is new and marked `CANDIDATE` in `codes.ts`; Q07 still owns the
registry.

## Ambiguity discovered

**None that required a language decision.** The scope boundary kept this slice
inside behaviour the accepted documents already fix. The one judgement call —
the severity of an unreachable arm — is recorded above as provisional rather
than decided, because docs/spec/type-system.md requires the diagnostic but not
its severity.

The ambiguity carried over from slice 1A is unchanged: the prelude `Result`'s
payload field names remain unresolved under Q04/Q06, and nothing here depends on
them.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/match.ko` | exhaustive match, payload extraction, `_` catch-all and `_` in payload position, match as a value and as a statement, block arms, `return` from an arm, nested match, two enums, scrutinee evaluated once |
| `tests/syntax/data-declarations.ko` | compact, multiline and trailing-comma arm lists |
| `tests/types/match-errors.ko` | missing one and several variants, variant of another enum, unknown variant, payload arity both ways, unnamed payload, duplicate arm, unreachable after `_`, redundant `_`, incompatible arm types, non-enum scrutinee, bare-name pattern |
| `tests/types/match-bindings.ko` | binding type from the declaration, binding does not leak, shadowing a local, a parameter and a function, repeated binding in one pattern |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/match.ko
```
