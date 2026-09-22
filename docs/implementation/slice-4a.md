# Compiler slice 4A — explicit generic functions

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

Slice 4A turns on `fn identity<T>(value: T) -> T` and `identity<Int>(42)`.
[Slice 2A](slice-2a.md) gave generic *types* a complete treatment,
[Slice 3A](slice-3a.md) made them inhabitable, and
[Q05-A](q05a-identity-foundation.md) gave functions an owner identity. This
slice spends all three.

```text
.ko source
  -> lexer            (unchanged)
  -> parser           + type parameters on a function, type arguments on a call
  -> AST              + FunctionDecl.typeParameters, CallExpression.typeArguments
  -> resolver/checker + parameter scope, call-site substitution
  -> obligations      + opaque responsibility for an abstract type parameter
  -> typed IR         + IRCall.typeArguments (read only by the obligation pass)
  -> JavaScript       (unchanged - fully erased)
  -> runtime          (unchanged)
```

## Accepted language behaviour

### Declarations

```ko
fn identity<T>(value: T) -> T {
    value
}

fn pair<A, B>(a: A, b: B) -> Pair<A, B> {
    Pair<A, B> {
        first: a
        second: b
    }
}
```

Non-empty, comma separated, trailing comma allowed, multiline allowed. No
bounds, defaults or variance. Duplicates rejected. `Result`, `Ok`, `Err`,
`Decimal` and the primitive names are unavailable, aligning functions with the
rule data declarations already follow.

### Calls write their type arguments

```ko
identity<Int>(42)
pair<String, Int>("age", 42)
```

Exactly the declared number, always written:

```ko
identity(42)                 // rejected - Koda does not infer type arguments
identity<>(42)               // rejected
identity<Int, String>(42)    // rejected
add<Int>(1, 2)               // rejected - 'add' declares none
```

### The body is checked once

Under abstract type parameters, never per call, never monomorphised. An
unconstrained `T` has no capabilities, so these are rejected without inventing
constraints:

```ko
fn bad<T>(x: T) -> T { x + x }          // arithmetic needs Int or Float
fn eq<T>(a: T, b: T) -> Bool { a == b } // no equality in v0.1
fn get<T>(x: T) -> Int { x.field }      // a T value has no fields
fn show<T>(x: T) -> String { "{x}" }    // not interpolatable
```

### Substitution at the call site

Parameters are checked against substituted types and the call's type is the
substituted return type, recursing through `Box<T>`, `Result<Box<T>, E>`,
`Pair<T, T?>` and `Box<Result<T, E>>` alike.

A substituted expectation may drive ordinary contextual construction:

```ko
fn consume<T>(box: Box<T>) -> Unit { ... }

consume<Int>(Box { value: 42 })     // expected Box<Int>; Box's argument follows
```

That is [Slice 3A](slice-3a.md)'s rule reading a type the programmer wrote. It
is **not** generic-function inference.

### Opaque responsibility for an abstract type parameter

```ko
fn identity<T>(x: T) -> T { x }     // accepted - handed on by the return
fn ignore<T>(x: T) -> Unit { }      // rejected at the declaration
```

A generic body cannot see whether `T` is a `Result`, so Koda assumes it may be.
A `T`-typed value may be returned, passed onward or stored; it cannot be
handled, because an abstract `T` cannot be matched. `ignore` is rejected once,
at its declaration, even though `T = Int` would carry nothing.

Without this, `ignore<Result<Int, String>>(operation())` would have discarded a
failure silently, because the caller's transfer discharges it and the callee
never accounted for it.

## Implementation detail

**Everything reused, nothing invented.** The parser's `parseTypeParameters` (from
Slice 2A) handles declarations unchanged; `parseTypeArgumentList` and
`genericSuffixEnd` (from Slice 3A) handle calls. `genericSuffixEnd` already
returned its index only before `(`, `{` or `.` — Slice 3A wired `{` and `.`,
and this slice wires the `(` that was still rejected.

**One ambient field, mirroring `returnType`.** `this.typeParameters` holds the
function's parameters while its signature and body are checked, which is what
lets `T` resolve at the four sites that previously passed an empty list:
parameter annotations, the return annotation, local annotations in the body,
and written construction arguments.

**Substitution, not instantiation.** A call resolves its written arguments and
calls `substitute(type, target.declarationId, args)` for each parameter and for
the return type. No instantiated `FunctionSymbol` is created, no body is
re-checked, and no monomorphisation happens.

**Owner identity is Q05-A's.** A function's type parameters are owned by its
`DeclarationId`. Because `substitute` compares owners with `sameDeclarationId`,
a callee's `T` provably cannot capture a caller's `U`.

**The responsibility change is one branch.** `Shapes.of` gives a
`TypeParameter` `acknowledgment: true` with no children and no alternatives.
Everything else — `fresh`, `receive`, `transfer`, renewal, `bind`, overwrite,
return transfer, parameter acquisition, temporaries — is the existing Slice 3B
machinery, unchanged. There is no second obligation engine.

**Why no alternatives.** An abstract responsibility has no variants to expose,
so no match can discharge it. That is exactly the accepted rule, expressed in
the shape rather than in a special case.

**`Unit?` guard extended.** Substituting `T = Unit` into `T?` would produce a
type the language does not implement. The existing guard now also runs over a
substituted signature, so an instantiation cannot create a type that is
otherwise forbidden.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| `IRCall` carries resolved type arguments | The obligation pass needs the substituted shapes; the emitter ignores them | none |
| The abstract-responsibility diagnostic reuses `KODA-T0012` | The condition is the same one: a responsibility left outstanding | **Q07** |

**No new diagnostic code was introduced.**

## Deferred

| Feature | Note |
| --- | --- |
| Type-argument inference | Explicitly rejected for v0.1, not merely unimplemented |
| Constraints, bounds, variance, higher-kinded types | ADR 0007 deferrals; still `KODA-U0001` |
| First-class or partially applied generic functions | v0.1 has no first-class functions |
| A more precise parametric responsibility model | The accepted rule is deliberately conservative and relaxable |
| A deliberate-ignore form | Not proposed |
| Collections, loops, ownership, borrowing | Untouched |
| Runtime generic metadata | Never; calls are fully erased |
| Modules, imports, Q06, Q08 | Untouched |

## Diagnostics

| Code | Condition |
| --- | --- |
| `KODA-N0002` | duplicate or reserved type-parameter name |
| `KODA-T0011` | missing, empty or miscounted type arguments; arguments on a non-generic function |
| `KODA-T0001` | argument mismatched against its **substituted** parameter type; an operation an unconstrained type parameter does not support |
| `KODA-N0001` | unknown type in an argument list |
| `KODA-U0001` | bounds, defaults, variance |
| `KODA-T0012` | an abstract type-parameter responsibility left outstanding |

```text
error[KODA-T0012]: 'x' still holds an outcome nobody has looked at
   |     this responsibility cannot be abandoned
note: 'x' has an unconstrained generic type, so Koda cannot tell whether it holds an outcome that needs handling
note: return it, or pass it to something that takes responsibility
note: a value of an unconstrained type parameter cannot be matched here, because this function does not know what it is
```

Messages name substituted types, never a type parameter, and never expose a
declaration identity, owner id or module id.

## Ambiguity discovered

**None.** The accepted rules covered every case the implementation reached, and
no stop condition was triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/generic-functions.ko` | identity, box, pair, two parameters, generic enums, generic-to-generic calls, recursion, contextual construction through a substituted expectation, nullable results, and erasure proven by execution |
| `tests/types/generic-functions.ko` | arity in every direction, `<>`, arguments on a non-generic function, unknown argument names, substituted argument mismatch, unconstrained operations, duplicate and reserved parameter names, `T` escaping its function |
| `tests/types/generic-responsibility.ko` | the adversarial obligation matrix: ignore, overwrite, dropped second parameter, container extraction, nested, nullable, `Phantom` vs `Box` |
| `tests/syntax/generic-function-forms.ko` | malformed declarations and calls; comparison regressions |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/generic-functions.ko
```
