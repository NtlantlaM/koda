# Type system

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** user principles: strong typing/inference, immutable defaults, null safety, explicit results, and enum matching. Nominality, exact checking rules, numeric representation, and aliasing are **EXPERIMENTAL / AWAITING DECISION** (Q11, Q02–Q04).

## Types and inference

Proposed primitives are `Bool`, `String`, `Int`, `Float`, and `Unit`. There is no user-visible `any`, implicit coercion, or automatic conversion from JavaScript values. Local binding types and generic call arguments are inferred from expressions and expected types. Function parameters and return types require annotations in v0.1, including private functions, to keep boundaries and diagnostics clear.

An unconstrained `null` or `Ok`/`Err` type parameter needs context or an annotation; inference must not invent an unsafe type. Recursive functions use their declared signatures. Generic parameters are invariant initially. Generic bodies must type-check for all allowed substitutions; there are no trait constraints in v0.1, so unconstrained generic values cannot be added, ordered, or inspected as records.

`type` declares nominal records. Two declarations with identical fields are distinct types. Every construction provides all fields exactly once; unknown fields are errors. No implicit structural subtyping or record inheritance is provided. `enum` declares a closed nominal set of variants, optionally carrying typed data.

## Mutability

```ko
let name = "Koda"
mut count = 0
count = count + 1
```

Assignment to `let` is an error. The proposed v0.1 model makes record fields immutable and allows `mut` to rebind the whole value. Field assignment, mutable collections, interior mutability, and borrowing are outside v0.1. Q03 must confirm that model and its aliasing guarantees before implementation. JavaScript interop must not silently expose foreign mutable objects as immutable Koda records.

## Nullable values

`T?` contains a `T` value or `null`. `T` can be used where `T?` is expected; the reverse requires a check. `null` is not a value of non-nullable `T`. Nested nullable suffixes are rejected in the proposed subset.

```ko
fn display(name: String?) -> String {
    match name {
        null => "Anonymous",
        value => value,
    }
}
```

After the `null` arm, `value` binds the remaining non-null `String`. v0.1 uses match-based narrowing only; general control-flow refinement from `if value != null` is LATER. Accessing a field through `T?` without narrowing is an error. Foreign `undefined` is not automatically `null`; a boundary conversion must specify it.

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

## Numeric and equality proposal

Candidate v0.1 model: `Int` is a checked safe integer backed by JavaScript numbers; `Float` is binary64. This is EXPERIMENTAL: Q02 must define range, overflow, division, remainder, non-finite values, and literal typing. Do not infer semantics from the backend's operators.

Primitive equality compares values of the same type. String equality compares exact contents with no implicit normalization. Record/enum equality and identity comparisons are LATER; no JavaScript reference equality leaks into their public semantics. Ordering is numeric only in the candidate subset.

## Failure boundary

Expected failures use `Result`. Unrecoverable runtime failures such as violated runtime invariants or exhausted resources are fatal and cannot become arbitrary successful values. Which numeric failures are fatal versus explicit results is part of Q02. JavaScript exceptions require the explicit interop policy in Q06.
