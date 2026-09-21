# Compiler slice 2B — Result values and matching

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

Slice 2B turns on `Result<T, E>`: the prelude declaration, the unqualified
constructors `Ok` and `Err`, contextual construction, and unqualified patterns.

> **Must-handle enforcement is not in this slice.**
> [ADR 0010](../decisions/0010-q04-result-obligations.md) requires a reachable
> abandoned or overwritten Result to be an error. That analysis lands in slice
> 2C. ADR 0010 is **accepted in full and is not weakened** by the staging: until
> 2C, a discarded Result is an *unimplemented* obligation, not a permitted one.
> That analysis has since landed — see [slice 2C](slice-2c.md).

```text
.ko source
  -> lexer            (unchanged)
  -> parser           + unqualified variant pattern, `Ok(value)`
  -> AST              + VariantPattern.enumName may be null
  -> resolver/checker + prelude Result, contextual construction, name policy
  -> typed IR         (unchanged)
  -> JavaScript       (unchanged)
  -> runtime          (unchanged)
```

## Accepted language behaviour

### The prelude declaration

```ko
enum Result<T, E> {
    Ok(value: T)
    Err(error: E)
}
```

Payload names `value` and `error` are accepted (ADR 0010 follow-up,
2026-09-21). Result is an ordinary closed enum under the Slice 2A generic
rules: nominal, invariant, applied with exactly two arguments.

### Construction is unqualified and positional

```ko
Ok(user)
Err(error)
```

`Result.Ok(...)` is not a v0.1 spelling and is rejected with a message pointing
at the bare form. Ordinary user enum variants stay qualified; `Ok` and `Err` are
the accepted exception.

### Contextual construction

A constructor determines only its own payload, so the complete `Result<T, E>`
comes from an expected-type context:

| Context | Example |
| --- | --- |
| Annotated binding | `annotated: Result<Int, E> = Ok(5)` |
| Function final expression | `fn load() -> Result<User, E> { Ok(user) }` |
| Explicit return | `return Err(error)` |
| Argument position | `consume(Ok(42))` |

An expected `Result<T, E>?` supplies the arguments by looking through **exactly
one** outer nullable wrapper. The constructor still produces `Result<T, E>`; the
ordinary non-null-into-nullable rule performs the injection:

```ko
fn parse() -> Result<Int, ParseError>? {
    Ok(42)              // valid
}
```

Without such a context the constructor is rejected rather than completed:

```ko
result = Ok(42)         // rejected: nothing says what Err would hold
```

Nothing else is inspected — not sibling branches, not later uses, not
assignments, not wrappers of any other shape.

### Matching

```ko
match outcome {
    Ok(n) => "ok {n}"
    Err(problem) => describe(problem)
}
```

`Ok` binds `T` and `Err` binds `E` through ordinary Slice 2A substitution.
Binding names are fresh pattern locals and need not match `value`/`error`.
No-shadowing applies. `Ok` and `Err` are the complete variant domain, so
covering both is exhaustive; a wildcard is ordinary match coverage.

### Prelude names are closed

`Result`, `Ok` and `Err` cannot be declared by a user, nor used as pattern
bindings. They are resolvable but never shadowable.

## Implementation detail

**Prelude representation.** `declarePreludeResult()` builds one
`EnumDeclaration` with the same shape the user-declaration path produces — two
`TypeParameterSymbol`s, two variants, each with a one-field payload typed by a
`TypeParameter` — and registers it in the ordinary `enums` map. Every later
stage therefore treats Result as the ordinary enum it is: application and arity
via `resolveTypeName`, payload types via `instantiatedField`, patterns via
`resolveArmPattern`, exhaustiveness via the existing variant-coverage walk, and
lowering via the existing `$tag` emitter. **No stage special-cases Result's type
semantics.**

**Name policy.** `RESERVED_PRELUDE_NAMES` (names that are unavailable) now holds
only `Decimal`. A separate `PRELUDE_NAMES` set holds `Result`, `Ok`, `Err` —
resolvable, but rejected by `claimModuleName` and `declarePatternBinding`.

**Expected-type plumbing.** `checkExpression` now forwards `expected` to
`checkCall`, which was the single missing link; all four contexts already
computed it. `checkCall` routes a callee named `Ok`/`Err` to
`checkResultConstructor`, which peels at most one `Nullable`, requires the
result to be a Result application, and checks the one argument against the
instantiated payload type. That is contextual checking, not inference: no
unification variables, no constraint solver, no search.

A pleasant consequence of threading `expected`: `Ok(42)` in a
`Result<Float, E>` position retargets the literal under ADR 0008's existing
contextual typing, with no extra code.

**Pattern parsing.** A bare identifier followed by `(` parses as an unqualified
variant pattern — unambiguous, because a binding pattern is never followed by
`(`. `VariantPattern.enumName` is `null` for that form, and the checker accepts
it only for Result; for a user enum it says which enum name to write. A bare
identifier *not* followed by `(` keeps its Slice 1C meaning.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| The prelude declaration takes declaration id 0, allocated before user declarations | Nominal identity only needs the id to be distinct and stable. | none (unobservable) |
| Prelude spans point at offset 0 of the compiled file | Result has no source location; its spans only ever appear as secondary "declared here" labels. | none (unobservable) |
| Result lowers as `{ $tag: "Ok", k_value: … }` | Reuses the enum layout from slice 1A, already provisional. | **Q08** |

No new Q08 decision was required, and no IR, emitter or runtime change was made.

## Deferred

| Feature | Note |
| --- | --- |
| **Must-handle obligation analysis** | Delivered by [slice 2C](slice-2c.md). Discarded Results, outstanding obligations, alias identity, transfer, overwrite, function-exit and path-sensitive accounting are all absent from 2B itself. |
| Direct variant patterns through `Result<T, E>?` | The Slice 1C boundary is preserved: resolve absence first, then match. |
| Generic construction for user-defined data | `Box<Int> { value: 42 }` remains rejected. Result's constructors are a narrow prelude surface, not authority to generalise. |
| A `Unit` literal | `Result<Unit, E>` is a legal type; producing a Unit value still requires calling a Unit-returning function. |
| Generic functions and `f<T>(...)` calls | Unchanged from Slice 2A. |
| Result propagation operator | Explicit ADR 0011 deferral. |

Result does **not** capture integer overflow, division by zero or invariant
failures. Those remain checked arithmetic faults under ADR 0008; no exception
machinery was added.

## Diagnostics

| Code | Condition |
| --- | --- |
| `KODA-T0001` | an unconstrained `Ok`/`Err`; a non-Result expectation; a payload type mismatch; `Result.Ok(...)` |
| `KODA-T0006` | a constructor given other than one value |
| `KODA-T0011` | wrong number of type arguments to `Result` |
| `KODA-T0003` | a match missing `Ok` or `Err`, named in the label |
| `KODA-T0010` | a duplicate or unreachable Result arm |
| `KODA-N0002` | `Result`/`Ok`/`Err` declared or bound by a user |
| `KODA-N0001` | an unqualified pattern for a user enum |
| `KODA-U0001` | a variant pattern through a nullable Result |

**No new diagnostic code was introduced.** The unconstrained-constructor message
follows the precedent set by the bare-`null` diagnostic:

```text
error[KODA-T0001]: this 'Ok' has no error type
   |     nothing here says what 'Err' would hold
note: 'Ok' says what the success value is, but nothing here says what 'Err' would hold
note: give it a context that names both sides, such as a return type `-> Result<Value, Error>`, an annotated binding, or a parameter
note: Koda never invents the missing type
```

Exact wording remains provisional under Q07.

## Ambiguity discovered

**None.** The accepted rules covered every case the implementation reached, and
no stop condition was triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/result.ko` | all four construction contexts plus the nullable one; `Ok`/`Err` matching with bindings unlike `value`/`error`; wildcard coverage; nested `Result<Result<…>, …>`; a record payload; a nullable Result resolved then matched; `$tag` lowering proven by execution |
| `tests/types/result-errors.ko` | arity three ways; unconstrained `Ok` and `Err`; non-Result expectation; wrong `Ok`/`Err` payload types; wrong constructor arity; missing `Ok` and `Err` arms; duplicate arm; unreachable after `_`; binding shadowing a parameter; `Result.Ok`/`Result.Err`; unqualified user-enum patterns with and without a payload; `Result`/`Ok`/`Err` declared by a user; `Err` as a pattern binding; the nullable-Result variant-pattern boundary |
| `packages/compiler/test/generics.test.ts` | Result as an ordinary generic application; constructors still needing context; generic construction still deferred |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/result.ko
```
