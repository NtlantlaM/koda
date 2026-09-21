# Type system

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** Q11 rules are recorded in [ADR 0007](../decisions/0007-q11-type-boundaries.md), alongside the user principles of strong typing, immutable defaults, null safety, explicit results, and enum matching. Numeric behavior is **ACCEPTED** in [Q02 / ADR 0008](../decisions/0008-q02-numeric-semantics.md). Mutation and Result obligations are accepted in ADRs 0009 and 0010; concrete syntax is accepted in ADR 0011. Remaining feature-specific gaps do not reopen those decisions.

## Types and inference

Proposed primitives are `Bool`, `String`, `Int`, `Float`, and `Unit`. There is no user-visible `any`, implicit coercion, or automatic conversion from JavaScript values in the baseline proposal. Q11 accepts inference of local variable and call-result types, with explicit parameter and return types required at function boundaries, including private functions. Detailed generic-call inference rules remain to be specified; they must respect the accepted invariant generic model.

An unconstrained `null` or `Ok`/`Err` type parameter needs context or an annotation in the baseline inference proposal; inference must not invent an unsafe type. Ordinary function recursion is accepted and uses declared signatures. Small invariant user-defined generics are supported in v0.1; variance and advanced generic constraints are deferred. Generic bodies must type-check for their allowed substitutions; operations cannot be assumed for an unconstrained parameter.

Koda-defined types have nominal identity. Two different `type` declarations with identical fields are distinct types; `enum` declarations are nominal as well. The baseline construction proposal requires every field exactly once and rejects unknown fields. No structural interchangeability follows solely from matching shapes. Recursive user-defined data types are deferred; this does not restrict ordinary function recursion.

Local and parameter shadowing is rejected, including same-scope duplicate declarations. This does not choose Q01's type/value namespace or prelude-name rules.

## Mutability

```ko
name = "Koda"
mut count = 0
count = count + 1
```

An immutable binding cannot be reassigned. ADR 0009 makes ordinary core values transitively immutable and allows `mut` to rebind the whole value. Core collection updates return new values. Mutable-reference parameters, ownership/borrowing and shared mutable resources are outside v0.1. JavaScript interop must not silently expose foreign mutable objects as immutable Koda records.

## Nullable values

`T?` contains a `T` value or `null`. `T` can be used where `T?` is expected; the reverse requires a check. `null` is not a value of non-nullable `T`. Explicitly written `T??` is rejected. Nullable generic substitution flattens where necessary: substituting a nullable type for `T` in `T?` does not create an observable second absence layer.

```ko
fn display(name: String?) -> String {
    match name {
        null => "Anonymous",
        value => value,
    }
}
```

After the `null` arm, `value` binds the remaining non-null `String`. A binding arm placed *before* a `null` arm catches the remaining nullable domain and makes the later `null` arm unreachable.

Null refinement is accepted both through `match` and through explicit null checks. This does not authorize alias-aware mutable smart casts in v0.1 or extend the guarantee to mutable bindings or aliased properties. Access through a nullable value requires appropriate refinement. Foreign `undefined` mapping remains a Q06 decision.

### Explicit null checks

An explicit null check is written `x != null` or `x == null`. Equality and inequality accept a nullable operand compared against `null`. **That comparison is an absence test**: it asks whether a value is present, and neither uses nor enables ordinary equality for the underlying type. `user == null` is valid for a `User?` even though `user1 == user2` remains invalid while derived equality for user-defined value types is deferred. This is not general mixed-type equality. A non-nullable `T` compared directly with `null` is invalid, and an unconstrained comparison such as `null == null` is invalid without sufficient type context.

A binding is refinable when it is **stable** — it cannot be rebound during the refinement's lifetime. Eligible: immutable local bindings and immutable function parameters, the latter being immutable under [ADR 0009](../decisions/0009-q03-mutation-and-aliasing.md) items 6 and 7. Not eligible: mutable locals, member expressions and arbitrary expressions.

Both directions refine. The non-null branch is the `then` branch of `x != null` and the `else` branch of `x == null`; there the binding has type `T`.

Refinement is **lexical**. A nested scope inherits an active refinement, and at an ordinary control-flow join the binding returns to its declared nullable type.

Refinement composes **left to right through `&&`**: the right operand is checked under the refinements its left operand establishes, so in `if user != null && allowed(user)` the call receives a non-null `User`, and both refinements hold in the body. Order matters. No general Boolean-flow analysis is implied.

Deferred, and therefore not sources of refinement: early-return and post-dominator narrowing, so a binding stays nullable after `if x == null { return }`; `||`; negation; an intermediate `Bool` binding; and arbitrary equivalent Boolean expressions.

## Results and matching

Prelude declaration:

```ko
enum Result<T, E> {
    Ok(value: T)
    Err(error: E)
}
```

The payload field names `value` and `error` are accepted (2026-09-21). `Result`
is an ordinary closed enum under the accepted generic rules: nominal, invariant,
and applied with exactly two arguments.

### Constructing a Result

Its constructors are the prelude names `Ok` and `Err`, written **unqualified and
positionally**:

```ko
Ok(user)
Err(error)
```

`Result.Ok(...)` and `Result.Err(...)` are not v0.1 spellings. Ordinary
user-defined enum variants remain qualified; `Ok` and `Err` are the accepted
exception.

A constructor determines only its own payload, so the rest of the type must come
from an expected-type context: an annotated binding, a function's final
expression, an explicit `return`, or an argument position. When the expected
type is a nullable `Result<T, E>?`, exactly the outer nullable wrapper is looked
through to find the arguments; the constructor still produces `Result<T, E>`,
and the ordinary non-null-into-nullable rule performs the injection. Nothing
else is inspected — not sibling branches, not later uses, not surrounding
wrappers of any other shape.

Without such a context the constructor is rejected rather than completed with an
invented type:

```ko
result = Ok(42)     // rejected: nothing says what Err would hold
```

### Matching a Result

```ko
match result {
    Ok(value) => ...
    Err(error) => ...
}
```

`Ok` binds `T` and `Err` binds `E` under ordinary generic substitution. Binding
names are fresh pattern locals and need not match the declared field names. For
a non-nullable `Result<T, E>`, `Ok` and `Err` are the complete variant domain,
so covering both is exhaustive.

`Result<T, E>` is an ordinary closed enum with prelude constructor names `Ok` and `Err`. It is not an exception mechanism. A function handles a result with `match`, returns it, or stores it for subsequent handling. No implicit unwrapping or propagation occurs. A bare Result-valued expression statement is a compile error; an unused Result binding also needs a diagnostic. ADR 0010 makes reachable abandonment and overwrite errors and permits deliberate ignoring through explicit outcome matching; the compiler does not claim that passing or storing a result proves meaningful business-level handling. Enforcement is implemented in [slice 2C](../implementation/slice-2c.md).

### Discharging a Result obligation

Binding a Result does not discharge it: `result = operation()` creates an outstanding responsibility. It is discharged by explicitly handling the value, returning it, passing it onward, or storing it into a value.

Handling through `match` requires **both alternatives to be visible**:

```ko
match result {
    Ok(value) => ...
    Err(error) => ...
}
```

`Ok(_)` and `Err(_)` also discharge, because both alternatives are named even though the payloads are deliberately ignored. `Ok(value)` followed by `_`, and a lone `_`, do **not** discharge. Exhaustiveness and discharge are separate properties: a wildcard can make a match exhaustive without making the failure visible.

A Result **parameter** begins its function with an outstanding obligation, so a function cannot become a reusable way to swallow failure. Binding an outstanding Result into another name **transfers** it: after `second = first`, the responsibility belongs to `second`. An outstanding Result may not be overwritten; rebinding a `mut` Result that has already been discharged starts a fresh obligation.

Obligations are checked at every scope exit and at every `return`. A Result handled on only one branch of an `if` remains outstanding after the join; one handled on one branch and transferred on the other is discharged.

A binding whose own type is `Result<T, E>?` carries an obligation, discharged by the nullable match that exposes absence and presence; the bound present value then carries its own.

**Enforcement limitation.** Tracking follows a binding whose *own* type is `Result<T, E>` or `Result<T, E>?`. Storing a Result into a record field or enum payload transfers the local obligation and tracking stops, so a container holding an unhandled Result can currently be dropped without a diagnostic. That is an unimplemented obligation, not a permitted discard.

Match exhaustiveness covers enums, `Bool`, and nullable types. Matching open domains such as numbers and strings requires a catch-all binding or `_`. Arms are considered in order; unreachable arms are diagnosed. Each variant's payload must have the correct arity. All value-producing arms must agree on a type, allowing only explicit nullable injection. No implicit union inference is proposed.

## Accepted numeric semantics and equality

`Int` is checked signed 64-bit and `Float` is IEEE-754 binary64 on every backend. [Numeric semantics](numbers.md) defines accepted Q02 literal typing, explicit conversions, truncating division/remainder, checked faults, binary64 special values, and boundary validation. JavaScript implementation choices cannot redefine these rules. Decimal is reserved but unusable in v0.1.

Primitive equality is supported in v0.1. Q02 requires matching typed numeric operands for equality and ordering; mixed Int/Float comparisons require explicit conversion. NaN is unequal to itself and all its ordering comparisons are false; signed zeros compare equal. Reference/object identity is not exposed. A nullable value may be compared with `null` using `==` and `!=`; that comparison is an absence test and neither uses nor enables equality for the underlying type. Derived equality for user-defined value types is deferred; entity identity/equality is a later persistence decision under Q09. Ordering remains numeric only in the baseline proposal.

## Strings

Strings have Unicode scalar-value semantics. Equality compares exact scalar-value sequences without normalization; canonical equivalence alone does not make differently represented sequences equal. Invalid/lone surrogate values are rejected at foreign boundaries; Q06 still determines the surrounding conversion/error contract.

String interpolation and multiline strings are supported. ADR 0011 defines their surface spelling and escaping; unresolved multiline layout details remain separate; numeric interpolation follows [Q02's canonical formatting rules](numbers.md); nonnumeric interpolation conversion rules remain to be specified. Direct string indexing and length semantics are deferred. No UTF-16 code-unit indexing or implicit length definition is inherited from JavaScript.

## Failure boundary

Expected failures use `Result`. Unrecoverable runtime failures such as violated runtime invariants or exhausted resources are fatal and cannot become arbitrary successful values. Q02 fixes source-located checked integer faults and Result-returning fallible numeric conversions; see [the separate constant-evaluation contract](numbers.md#arithmetic-faults-and-constant-evaluation-s17). Fault transport and exit reporting remain Q04/Q07 integration work. JavaScript exceptions require the explicit interop policy in Q06.

## Generic data types (Slice 2A)

Status: **ACCEPTED**, explicit human clarification of Q11 on 2026-09-21.
[ADR 0007](../decisions/0007-q11-type-boundaries.md) owns these semantics.

Records and enums may declare unconstrained type parameters. A parameter belongs
to its declaring type/enum, is visible throughout its field/payload type syntax,
and does not enter the global scope. Parameter names in different declarations
have distinct identities. Reject duplicate parameters within one declaration and
parameters named for primitive or prelude types. No additional global namespace
policy is selected by this rule.

Generic applications identify the declaration and all ordered type arguments.
Argument arity must match exactly. Nongeneric types cannot take arguments.
There are no defaults, omissions, partial applications, or raw/unapplied generic
concrete types in Slice 2A. Unknown argument types remain unresolved-name errors.

Substitute parameters recursively through fields, enum payloads, nested applications,
and nullable types. Generic arguments are invariant: `Box<Int>` is neither
`Box<Int?>` nor `Box<Float>`. Different declarations remain nominally distinct.
Types with identical substituted fields need not be the same instantiation.

For `type MaybeBox<T> { value: T? }`, both `MaybeBox<Int>` and
`MaybeBox<Int?>` have field type `Int?`, but retain distinct outer identities.
Nullable normalization applies to substituted nullable layers, not generic argument
identity. `Box<Int>?` and `Box<Int?>` also remain distinct. Written `T??`
is still rejected.

Finite nesting such as `Box<Box<Int>>` is valid. Follow stored field/payload
type dependencies to detect declaration cycles; revisiting the same declaration
on that dependency path is invalid regardless of its supplied arguments. This
rejects direct, mutual and transformed recursion, without treating repeated
names in finite use-site nesting as recursion.

Slice 2A permits generic data descriptions in annotations, nongeneric function
signatures, fields, and payloads. It adds no generic construction, generic
functions, generic-call inference, Result or Result obligations. No constraints
or runtime generic representation strategy is selected; Q08 remains unresolved.
