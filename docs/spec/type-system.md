# Type system

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** Q11 rules are recorded in [ADR 0007](../decisions/0007-q11-type-boundaries.md), alongside the user principles of strong typing, immutable defaults, null safety, explicit results, and enum matching. Numeric behavior is **ACCEPTED** in [Q02 / ADR 0008](../decisions/0008-q02-numeric-semantics.md). Mutation/aliasing and Result enforcement remain **AWAITING DECISION** under Q03–Q04. Concrete syntax remains Q01.

## Types and inference

Proposed primitives are `Bool`, `String`, `Int`, `Float`, and `Unit`. There is no user-visible `any`, implicit coercion, or automatic conversion from JavaScript values in the baseline proposal. Q11 accepts inference of local variable and call-result types, with explicit parameter and return types required at function boundaries, including private functions. Detailed generic-call inference rules remain to be specified; they must respect the accepted invariant generic model.

An unconstrained `null` or `Ok`/`Err` type parameter needs context or an annotation in the baseline inference proposal; inference must not invent an unsafe type. Ordinary function recursion is accepted and uses declared signatures. Small invariant user-defined generics are supported in v0.1; variance and advanced generic constraints are deferred. Generic bodies must type-check for their allowed substitutions; operations cannot be assumed for an unconstrained parameter.

Koda-defined types have nominal identity. Two different `type` declarations with identical fields are distinct types; `enum` declarations are nominal as well. The baseline construction proposal requires every field exactly once and rejects unknown fields. No structural interchangeability follows solely from matching shapes. Recursive user-defined data types are deferred; this does not restrict ordinary function recursion.

Local and parameter shadowing is rejected, including same-scope duplicate declarations. This does not choose Q01's type/value namespace or prelude-name rules.

## Mutability

```ko
let name = "Koda"
mut count = 0
count = count + 1
```

Assignment to `let` is an error. The proposed v0.1 model makes record fields immutable and allows `mut` to rebind the whole value. Field assignment, mutable collections, interior mutability, and borrowing are outside v0.1. Q03 must confirm that model and its aliasing guarantees before implementation. JavaScript interop must not silently expose foreign mutable objects as immutable Koda records.

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

After the `null` arm, `value` binds the remaining non-null `String`. Null refinement is accepted both through `match` and explicit null checks on stable immutable local bindings. In a branch established by an explicit non-null check, such a local can be used as non-null. This does not authorize alias-aware mutable smart casts in v0.1 or extend the guarantee to mutable bindings or aliased properties. Additional control-flow forms and their spelling remain to be specified without weakening these limits. Access through a nullable value requires appropriate refinement. Foreign `undefined` mapping remains a Q06 decision.

## Results and matching

Conceptual prelude declaration:

```ko
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

`Result<T, E>` is an ordinary closed enum with prelude constructor names `Ok` and `Err`. It is not an exception mechanism. A function handles a result with `match`, returns it, or stores it for subsequent handling. No implicit unwrapping or propagation occurs. A bare Result-valued expression statement is a compile error; an unused Result binding also needs a diagnostic. The exact severity and explicit-discard policy are Q04; the compiler does not claim that passing or storing a result proves meaningful business-level handling.

Match exhaustiveness covers enums, `Bool`, and nullable types. Matching open domains such as numbers and strings requires a catch-all binding or `_`. Arms are considered in order; unreachable arms are diagnosed. Each variant's payload must have the correct arity. All value-producing arms must agree on a type, allowing only explicit nullable injection. No implicit union inference is proposed.

## Accepted numeric semantics and equality

`Int` is checked signed 64-bit and `Float` is IEEE-754 binary64 on every backend. [Numeric semantics](numbers.md) defines accepted Q02 literal typing, explicit conversions, truncating division/remainder, checked faults, binary64 special values, and boundary validation. JavaScript implementation choices cannot redefine these rules. Decimal is reserved but unusable in v0.1.

Primitive equality is supported in v0.1. Q02 requires matching typed numeric operands for equality and ordering; mixed Int/Float comparisons require explicit conversion. NaN is unequal to itself and all its ordering comparisons are false; signed zeros compare equal. Reference/object identity is not exposed. Derived equality for user-defined value types is deferred; entity identity/equality is a later persistence decision under Q09. Ordering remains numeric only in the baseline proposal.

## Strings

Strings have Unicode scalar-value semantics. Equality compares exact scalar-value sequences without normalization; canonical equivalence alone does not make differently represented sequences equal. Invalid/lone surrogate values are rejected at foreign boundaries; Q06 still determines the surrounding conversion/error contract.

String interpolation and multiline strings are supported. Q01 must define their spelling, escaping, and multiline layout rules; numeric interpolation follows [Q02's canonical formatting rules](numbers.md); nonnumeric interpolation conversion rules remain to be specified. Direct string indexing and length semantics are deferred. No UTF-16 code-unit indexing or implicit length definition is inherited from JavaScript.

## Failure boundary

Expected failures use `Result`. Unrecoverable runtime failures such as violated runtime invariants or exhausted resources are fatal and cannot become arbitrary successful values. Q02 fixes source-located checked integer faults and Result-returning fallible numeric conversions; see [the separate constant-evaluation contract](numbers.md#arithmetic-faults-and-constant-evaluation-s17). Fault transport and exit reporting remain Q04/Q07 integration work. JavaScript exceptions require the explicit interop policy in Q06.
