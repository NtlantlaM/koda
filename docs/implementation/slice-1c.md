# Compiler slice 1C — nullability

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

Slice 1C adds nullable types to [slice 1B](slice-1b.md): `T?`, the `null`
literal, nullable `match`, and refinement by an explicit null check.

```text
.ko source
  -> lexer            (unchanged; `?` and `null` were already tokens)
  -> parser           + `T?` suffix, null literal, null pattern, bare-name pattern
  -> AST              + NullLiteral, NullPattern, TypeRef.nullable
  -> resolver/checker + Nullable type, refinement scopes, condition analysis
  -> typed IR         + IRNullConst, IRNullTest, IRNullableMatch
  -> JavaScript       + `null`, `=== null` tests, a single presence branch
  -> runtime          (unchanged)
```

## Accepted language behaviour

Everything below is required by
[ADR 0007](../decisions/0007-q11-type-boundaries.md) and its 2026-09-21
follow-up, by [ADR 0011](../decisions/0011-q01-concrete-syntax.md)'s nullable
surface, or by
[docs/spec/type-system.md](../spec/type-system.md#nullable-values).

### Types and the literal

A nullable type is written `T?`. `T` may be used where `T?` is expected; the
reverse requires a check. `null` is the absent value and has no type of its
own — the expected type supplies one, so an unconstrained `null` is rejected
rather than given an invented type. Written `T??` is rejected.

### A null comparison is an absence test

`x != null` and `x == null` accept a nullable operand against `null`. The test
asks whether a value is present. It does not use or enable ordinary equality for
the underlying type, so both of these hold at once:

```ko
fn state(user: User?) -> String {
    if user == null { "absent" } else { "present" }   // valid
}

fn same(a: User, b: User) -> String {
    if a == b { "same" } else { "different" }         // still rejected
}
```

A non-nullable `T` compared with `null` is rejected, as is `null == null`.

A null comparison is an ordinary expression wherever it appears —
`present = x != null` is a valid `Bool` binding. Only its *refinement* is
limited to conditions.

### Refinement

Refinable bindings are **immutable locals and immutable parameters**. Mutable
locals, member expressions and arbitrary expressions are not refinable.

Both directions refine: the `then` branch of `x != null` and the `else` branch
of `x == null`.

Refinement is **lexical**. A nested scope inherits it; at an ordinary join the
binding returns to its declared nullable type.

Refinement composes **left to right through `&&`**. The right operand is checked
under what the left established, so `if user != null && allowed(user)` passes a
non-null `User` to the call.

### Nullable match

```ko
match nickname {
    null => "Anonymous"
    value => value
}
```

After a `null` arm the binding takes the non-null type. A binding arm placed
first catches the remaining nullable domain and makes a later `null` arm
unreachable. A match without a catch-all is non-exhaustive.

## Implementation detail

**Type representation.** `KType` gains `{ kind: "Nullable", inner }`, whose
`inner` is never itself nullable. `isAssignable` allows `T` into `T?` and
refuses the reverse; `unify` merges `T` and `T?` at `T?`, which is the "explicit
nullable injection" `type-system.md` permits between arms.

**Refinement algorithm.** Each scope carries a `Map<symbolId, KType>` of active
refinements alongside its bindings. A name reference consults the innermost
entry before falling back to the declared type. `checkCondition` returns the
checked IR plus what the condition proves in each branch; `if` pushes a scope
holding `whenTrue` around the then-branch and `whenFalse` around the else.
Because refinements live in scopes, lexical inheritance and reset-at-join both
fall out of the existing scope stack rather than needing separate machinery.

**`&&` algorithm.** `checkCondition` on `a && b` checks `a`, pushes a scope with
`a`'s `whenTrue`, checks `b` inside it, then pops. The combined `whenTrue` is
the concatenation; `whenFalse` is empty, because a false `&&` proves nothing
about either operand. That is the whole of it — no Boolean-flow analysis.

**Eligibility.** A refinement is recorded only when the compared expression
resolves to a non-mutable `LocalSymbol`. Parameters already carry
`mutable: false`, so they qualify without a special case; member expressions are
not names and never reach the check.

**Nullable match lowering.** The scrutinee is bound to a temporary once, then a
single `=== null` test separates the arms. A catch-all binding is a `const`
alias of that temporary.

**Recursion.** The recursive-data check looks through `Nullable`, so
`type Node { next: Node? }` is still rejected under ADR 0007's deferral of
recursive data types — even though that is the shape a linked list would take.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| Koda's `null` is JavaScript `null` | Unit is `undefined`, so Unit and absence stay distinguishable, which the specification review requires. | **Q08** |
| A nullable value is the underlying representation or `null`, with no wrapper | Nothing observable distinguishes a present `T?` from a `T`, and there is no interop to expose the difference. | **Q08** |

Everything provisional in [slice 0](slice-0.md#provisional-choices),
[1A](slice-1a.md#provisional-implementation-choices) and
[1B](slice-1b.md#provisional-implementation-choices) remains so, including the
single module-level namespace, still **not ratified**.

## Deferred

| Feature | Note |
| --- | --- |
| Early-return / post-dominator narrowing | `if x == null { return }` leaves `x` nullable. Explicit ADR 0007 deferral. |
| Refinement through `||`, negation, an intermediate `Bool`, or equivalent Boolean expressions | Explicit ADR 0007 deferrals. The comparisons still type-check; only refinement is withheld. |
| Enum variant patterns directly under a `T?` scrutinee | Handle absence first, then match the bound value. |
| `Unit?` | Q08 — Unit and absence must stay distinguishable. |
| Bool matching | Accepted by `type-system.md`, not implemented. |
| Bare-name patterns for enum or other scrutinees | Introduced only for nullable matching, as instructed. |
| Nullable generic substitution flattening | The semantic rule stands, and `nullableType` already collapses a nested layer. Unreachable until generics exist. |
| `Result`, `Ok`, `Err` | Needs generics. |

## Diagnostics

| Code | Condition |
| --- | --- |
| `KODA-T0002` | a nullable value used where a present one is required — argument, return, field access, or binding |
| `KODA-T0001` | `null` for a non-nullable type; an unconstrained `null`; a non-nullable compared with `null`; `null == null`; a `null` pattern on a non-nullable scrutinee; arms disagreeing |
| `KODA-T0003` | a nullable match with no catch-all |
| `KODA-T0010` | an arm that can never run |
| `KODA-P0001` | written `T??` |
| `KODA-U0001` | `Unit?`; a variant pattern under a nullable scrutinee; a bare-name pattern on an enum; interpolating a nullable |

`KODA-T0002` was already in `docs/spec/diagnostics.md`'s table; its focus column
now names both refinement forms. **No new diagnostic code was introduced by this
slice.**

The `T0002` note shows both remedies, and adds a third line when the binding is
`mut`, explaining that a rebindable binding cannot be refined.

## Ambiguity discovered

**None that required a language decision.** The accepted rules covered every
case the implementation reached.

One behaviour is worth flagging as a *consequence* rather than an ambiguity:
because recursive data types remain deferred and the recursion check looks
through `Nullable`, the idiomatic nullable-terminated linked list
`type Node { value: Int, next: Node? }` is rejected. That follows from ADR 0007
as written; if nullable recursion should be the exception that unlocks recursive
data, that is a separate decision.

The ambiguity carried from slice 1A is unchanged: the prelude `Result`'s payload
field names remain unresolved under Q04/Q06.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/nullable.ko` | `T?` declarations and fields, `T` into `T?`, `null` into `T?`, nullable match with a binding and with `_`, `!=` and `==` refinement, nested lexical refinement, `&&` composition, the right operand seeing the left's refinement, nullable record compared with `null`, nullable enum handled by binding then matching, local and parameter refinement |
| `tests/types/nullable-errors.ko` | `T?` into `T`, `null` into `T`, unconstrained `null`, written `T??`, `Unit?`, unsafe use and unsafe field access, unsafe interpolation, missing present arm, `null` pattern on a non-nullable, binding-before-null unreachable, non-nullable compared with `null`, `null == null`, refinement reset after a join, variant under a nullable, and the absence test working while `User == User` stays rejected |
| `tests/types/nullable-refinement.ko` | the eight forms that do **not** refine: mutable local, property, intermediate `Bool`, `||`, negation, reversed `&&` order, early return, and the `then` branch of `==` |
| `tests/syntax/unsupported-features.ko` | `Unit?`, record and `Bool` scrutinees |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/nullable.ko
```
