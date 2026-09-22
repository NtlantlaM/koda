# Compiler slice 3A — generic value construction

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

[Slice 2A](slice-2a.md) gave generic types a complete type-level treatment and no
way to build a value of one. Every user-defined generic was well-typed, fully
checked and permanently uninhabited; `Result` worked only because the prelude
hand-writes its two constructors. Slice 3A closes that gap.

```text
.ko source
  -> lexer            (unchanged)
  -> parser           + type arguments at a construction site
  -> AST              + RecordExpression.typeArguments, MemberExpression.typeArguments
  -> resolver/checker + argument resolution, expected-type plumbing, substitution
  -> typed IR         (unchanged)
  -> JavaScript       (unchanged)
  -> runtime          (unchanged)
```

## Accepted language behaviour

### Explicit type arguments

```ko
Box<Int> { value: 42 }
Wrap<Int>.Has(42)
```

Resolved as an ordinary type application: exact arity, no defaults, no
omissions, no partial application. **Written arguments are authoritative** — they
are never adjusted to satisfy the context:

```ko
fn wrong() -> Box<String> {
    Box<Int> { value: 42 }      // rejected: Box<Int> is not Box<String>
}
```

### Contextual construction

With no written arguments, they come from the expected type and from nothing
else. The accepted contexts are an annotated binding, a function's final
expression, an explicit `return`, an argument position, and a field or payload
value.

```ko
fn make() -> Box<Int> {
    Box { value: 42 }
}
```

The expectation must name the declaration being built. One naming a different
declaration supplies nothing.

### Exactly one outer nullable wrapper

```ko
fn make() -> Box<Int>? {
    Box { value: 42 }           // builds Box<Int>, then ordinary injection
}
```

The constructed value stays non-nullable. This is the general rule now;
Result's nullable construction, accepted for Slice 2B, is its first instance
rather than a Result-only exception.

### Field and payload values are never consulted

```ko
value = Box { value: 42 }       // rejected: nothing says what T is
value = Wrap.Has(42)            // rejected: nothing says what T is
```

Koda does not infer an argument from what a field happens to hold. No inference
variables, no constraint solving.

### Substitution supplies the member types

```ko
Box<Float> { value: 1 }         // 1 is a Float here
```

Contextual literal typing (ADR 0008) keeps working through substituted field
types, because the substituted type is what reaches the value.

### Nesting

Ordinary recursion, so an inner construction may be explicit or contextual at
any finite depth:

```ko
Box<Box<Int>> { value: Box { value: 42 } }
```

## Implementation detail

**The parser already had the hard part.** `genericSuffixEnd()` — the renamed
`unsupportedGenericSuffixEnd()` — scans a balanced `<...>` and returns its index
only when the next token is `(`, `{` or `.`. It aborts on any token that is not
an identifier, newline, `,`, `<`, `>` or `?`, which is why `a < b {` can never
reach the closing condition: the `{` itself ends the scan. Slice 3A replaces the
rejection at that site with three outcomes — `{` builds a record literal, `.`
builds a member expression, and `(` **stays rejected** as generic-call syntax.

**Smallest AST approach**, as the readiness report proposed. `typeArguments`
was added to `RecordExpression` and to `MemberExpression`; no new node was
introduced. On `MemberExpression` the field is meaningful only when `target` is
a name, which matches how that node already carries two meanings and lets the
checker decide — ADR 0011's rule that the grammar never consults a symbol table.

**One resolution helper, two callers.** `resolveConstructionArguments` returns
the argument list for a declaration from either written arguments or an
expectation, peeling exactly one `Nullable`. `checkRecord` and `checkVariant`
call it; nothing else does. `Ok`/`Err` were deliberately **not** refactored onto
it.

**`expected` now reaches both.** The one missing link was `checkExpression`
dropping it at the `record` case, exactly as Slice 2B found with `checkCall`.
`checkVariant` gained the parameter and its two call sites pass it.

**Member types come from `instantiatedField`**, already used by field access
since Slice 2A. No new substitution machinery.

**The `Unit?` boundary moved with construction.** `supportedMemberType` guarded
member access only; a `Box<Unit>` with a `value: T?` field was unreachable while
construction was blocked. Construction now applies the same guard, so a value
cannot be built whose field could never be read.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| A wrong-declaration expectation is reported as an unconstrained construction rather than a mismatch | The user's problem is that nothing says what `T` is; naming the unrelated expectation in a note is more useful than a mismatch against a type they never wrote | none (presentation) |
| The unconstrained-construction message reuses `KODA-T0001` | Follows the precedent set by bare `null` and unconstrained `Ok`/`Err` | **Q07** |

**No new diagnostic code was introduced.**

## Deferred

| Feature | Note |
| --- | --- |
| Generic functions, `fn f<T>(...)` | Still rejected by the parser |
| Generic calls, `f<T>(x)` | Still rejected; `Name<T>(` is the one suffix that stays an error |
| Generic-call inference | No spelling, no rule |
| Field- or payload-based inference | Explicitly rejected, not merely unimplemented |
| Constraints, bounds, variance, higher-kinded types | ADR 0007 deferrals |
| Recursive generic data | `rejectRecursiveData` unchanged |
| Result redesign, obligation redesign | Untouched |
| Deep container obligation tracking | Still the Slice 2C limitation |
| Runtime generic metadata | Never; construction is fully erased |

## Diagnostics

| Code | Condition |
| --- | --- |
| `KODA-T0011` | wrong number of type arguments, `Box<>`, or arguments on a nongeneric type |
| `KODA-T0001` | no complete expected type for a contextual construction; explicit arguments disagreeing with the context; an instantiated field or payload mismatch |
| `KODA-T0008` | a generic record missing a field |
| `KODA-T0009` | an unknown field or variant |
| `KODA-T0006` | wrong payload arity |
| `KODA-N0001` | an unknown type argument name |
| `KODA-U0001` | `Name<T>(...)` generic-call syntax; a substituted member type containing `Unit?` |

```text
error[KODA-T0001]: this 'Box' has no type arguments
   |     nothing here says what 'T' is
note: 'Box' declares 1 type parameter, and a value of it needs every one
note: write them, as in `Box<Int> { ... }`, or give it a context that names them
note: Koda never infers a type argument from a field's value
```

## Ambiguity discovered

**None.** The accepted rules covered every case the implementation reached, and
no stop condition was triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/generic-construction.ko` | explicit and contextual records and enums; nullable contextual; payload-less generic variant; nested explicit and explicit-outer/contextual-inner; three-deep nesting; nullable type arguments; a generic record inside a generic enum payload; construction as an argument; `mut` rebinding; `Box<Float> { value: 1 }`; `$tag`/`k_` lowering proven by execution |
| `tests/types/generic-construction.ko` | unconstrained record and enum construction; explicit arguments disagreeing with the context; wrong arity both directions; `Box<>`; arguments on a nongeneric type; instantiated field and payload mismatches; missing, unknown and duplicate fields; unknown type argument name; the `Unit?` boundary |
| `tests/syntax/generic-rejected.ko` | `Name<T>(...)` still rejected; multiline type arguments in a call; unterminated applications |
| `tests/syntax/generic-construction-forms.ko` | `a < b > { }`; control-head suppression and the parenthesised escape; comparison-lookahead regressions |

`tests/types/generic-construction.ko` previously pinned all four construction
forms as `KODA-U0001`. It was rewritten to the new rules; the rules were not
weakened to preserve it.

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/generic-construction.ko
```

## Subsequent obligation work

The retained Slice 2C limitation above describes Slice 3A's closed scope.
[Slice 3B](slice-3b.md) is separately authorized to close that limitation; it
does not alter this slice's construction grammar or runtime representation.
