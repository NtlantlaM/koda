# 0007: Q11 type boundaries, null refinement, and strings

Status: **ACCEPTED**
Date: 2026-09-20
Approver: repository owner/user, by explicit instruction.
Resolves: [Q11](../design/proposals/q11-type-boundaries.md).
Supersedes: Q11's former recommendations and conflicting Q11-specific baseline wording in [ADR 0002](0002-explicit-data-and-failure.md); other ADR 0002 principles and open questions are unchanged.

## Context

The initial specification left type identity, inference boundaries, nullable refinement, strings, equality, shadowing, and recursion awaiting a deliberate decision. The proposal bundled some of these into a small-core recommendation. Strong typing alone did not settle those choices, and accepting that bundle would have missed the user's intended null-check refinement and string features.

## Decision

- Use nominal type identity for Koda-defined types.
- Require explicit parameter and return types at function boundaries.
- Infer local variable and call-result types.
- Support small invariant user-defined generics in v0.1.
- Defer variance and advanced generic constraints.
- Support `T?` for nullable values.
- Support null refinement through `match` and through explicit null checks on stable immutable local bindings.
- Do not provide alias-aware mutable smart casts in v0.1.
- Reject explicitly written `T??`.
- Flatten nullable generic substitution where necessary so nested nullable layers do not become observable language semantics.
- Support primitive equality in v0.1.
- Do not expose reference/object identity.
- Defer derived equality for user-defined value types.
- Treat entity identity/equality as a later persistence decision.
- Define strings using Unicode scalar-value semantics.
- Use exact, non-normalizing string equality.
- Reject invalid/lone surrogate values at foreign boundaries.
- Support string interpolation and multiline strings.
- Defer direct string indexing and length semantics.
- Reject local and parameter shadowing, including same-scope duplicate declarations.
- Allow ordinary function recursion.
- Defer recursive user-defined data types.

## Rationale

Nominal identity prevents unrelated domain types from becoming interchangeable solely because their shapes match. Explicit function boundaries document APIs for humans and AI; inference removes redundant local annotations. Small invariant generics enable reuse without the complexity of variance and advanced constraints.

Stable immutable local bindings allow useful null-check refinement without tracking mutable aliases. Flattened nullable substitution preserves one observable absence layer. Primitive equality supports basic programs without exposing JavaScript object identity or prematurely defining entity identity.

Unicode scalar-value semantics avoid making UTF-16 surrogate artifacts part of Koda's text model. Exact, non-normalizing equality avoids implicit normalization. Interpolation and multiline strings improve ordinary text construction. Rejecting shadowing makes name references unambiguous. Function recursion is useful independently of recursive data definitions.

## Alternatives considered

The Q11 proposal compared a small nominal core, a richer nominal/constraint system, and structural records with nominal wrappers. The accepted policy uses the small nominal direction but differs from the old recommendation: null checks on stable immutable locals are supported alongside match, and interpolation/multiline strings are included. Neither the full historical option A nor unrelated release-scope recommendations are accepted automatically.

## Consequences

Future checking must enforce nominal identity, annotated function boundaries, generic invariance, restricted refinement, nullable normalization, and name rules. Explicit `T??` is invalid even though nullable layers introduced through generic substitution flatten. Refinement cannot assume mutable aliases remain unchanged.

Foreign conversion must reject invalid scalar values rather than silently replacing lone surrogates. This does not choose Q06's error representation. The JS backend must preserve scalar text semantics and avoid exposing object identity, without yet choosing Q08's storage layout. Exact equality need not equate canonically equivalent but differently encoded scalar sequences.

Interpolation support does not approve implicit conversions elsewhere or choose formatting traits. Multiline support does not choose delimiters, indentation stripping, or newline normalization. Those details must be recorded when Q01 and related rules are resolved. Existing examples remain illustrative syntax and do not constitute compiler validation.

## Accepted follow-up details

Approver: repository owner/user, by explicit instruction. These fill in details
this decision named but left open; none supersedes anything above. The
corresponding spelling is recorded in
[ADR 0011](0011-q01-concrete-syntax.md), and the normative text in
[the type system](../spec/type-system.md#nullable-values).

### 2026-09-21 — null refinement

- **A null comparison is an absence test.** `x != null` and `x == null` accept a
  nullable operand compared against `null`. The test asks whether a value is
  present; it does not use ordinary equality for the underlying type and does
  not enable it. `user == null` is therefore valid for a `User?` even while
  `user1 == user2` remains invalid, because derived equality for user-defined
  value types stays deferred. This is not general mixed-type equality: a
  non-nullable `T` compared directly with `null` is invalid, and an
  unconstrained comparison such as `null == null` is invalid without sufficient
  type context.

- **Refinable bindings.** "Stable" means a binding that cannot be rebound during
  the refinement's lifetime. Eligible: immutable local bindings and immutable
  function parameters, the latter being immutable under
  [ADR 0009](0009-q03-mutation-and-aliasing.md) items 6 and 7. Not eligible:
  mutable locals, member expressions and arbitrary expressions.

- **Both directions refine.** The non-null branch is the `then` branch of
  `x != null` and the `else` branch of `x == null`. In it the binding has type
  `T`.

- **Refinement is lexical.** A nested scope inherits an active refinement, and
  at an ordinary control-flow join the binding returns to its declared nullable
  type.

- **Refinement composes left to right through `&&`.** The right operand is
  checked under the refinements its left operand establishes, so in
  `if user != null && allowed(user)` the call receives a non-null `User`, and
  both operands' refinements hold in the body. Order matters. This introduces no
  general Boolean-flow analysis or theorem proving.

- **Matching a nullable value.** After a `null` arm, a bare-name binding takes
  the non-null type `T`. A binding arm placed before a `null` arm catches the
  remaining nullable domain and makes the later `null` arm unreachable.

## Explicitly deferred features

- Variance and advanced generic constraints.
- Alias-aware mutable smart casts in v0.1.
- Derived equality for user-defined value types.
- Entity identity/equality, to the later persistence decision Q09.
- Direct string indexing and length semantics.
- Recursive user-defined data types.
- Early-return and post-dominator narrowing, so a binding stays nullable after
  `if x == null { return }`.
- Refinement through `||`, through negation, through an intermediate `Bool`
  binding, and through arbitrary equivalent Boolean expressions.

## Scope boundary

At this ADR's acceptance, only Q11 was resolved and Q01–Q10 and Q12–Q13 remained **AWAITING DECISION**. Subsequent [ADR 0008](0008-q02-numeric-semantics.md) resolves Q02; the scope of this Q11 decision is unchanged. Numeric behavior, mutation/aliasing, Result obligations, modules, foreign API/error contracts, runtime representation, tool protocols, concurrency, persistence, licensing, and publication policy are not selected here. Additional refinement forms and namespace rules are not inferred from this decision. No lexer, parser, compiler, runtime, CLI, or package-manager implementation is authorized.

## 2026-09-21 — accepted Slice 2A generic data foundations

Approver: repository owner/user, by explicit Slice 2A implementation authorization.
This is a clarification of Q11, not acceptance of Q08 or general namespace policy.

- User-defined records and enums may declare unconstrained generic parameters.
  Each parameter has its own declaration-local identity and is in scope throughout
  that declaration's field/payload type descriptions. Parameters do not create
  global names; different declarations' `T` parameters are unrelated.
- Duplicate parameter names and collisions with primitive or prelude type names
  are rejected. This does not settle other type/value namespace rules.
- An application consists of declaration identity plus ordered type arguments.
  Exactly the declared number must be supplied. No omitted/default/partial
  arguments, unapplied generic concrete types, or applications to nongeneric types.
- Arguments substitute recursively through member type descriptions. Applications
  are invariant and nominal, never equivalent merely because their fields agree.
- Substitution of a nullable argument into `T?` flattens to one nullable layer.
  `MaybeBox<Int>` and `MaybeBox<Int?>` remain distinct even when both fields
  substitute to `Int?`. `Box<Int>?` is distinct from `Box<Int?>`.
- Finite nesting such as `Box<Box<Int>>` is allowed. A declaration is invalid
  when following its stored field/payload type dependencies reaches the same
  declaration again, regardless of arguments. Direct, mutual, and transformed
  recursion (`Growing<T>` storing `Growing<Box<T>>?`) remain rejected.
  Repetition within a finite use-site application is not a declaration cycle.
- Slice 2A implements type foundations only: annotations, signatures, fields,
  payload descriptions, substitution, assignability, and diagnostics. Generic
  construction, generic functions/calls/inference, Result, and must-handle analysis
  are outside this slice. Their future acceptance is not withdrawn.
- No bounds, traits, where clauses, variance annotations, equality/operator
  constraints, or runtime erasure/reification/specialization policy is introduced.

See [type-system rules](../spec/type-system.md#generic-data-types-slice-2a)
and the [implementation boundary](../implementation/slice-2a.md).

## 2026-09-21 — accepted generic value construction (Slice 3A)

Approver: repository owner/user, by explicit Slice 3A decision and implementation
authorization. This is a clarification of Q11. It selects no Q08 representation,
no namespace policy, and no inference contract.

Slice 2A gave generic types a complete type-level treatment and no way to build a
value of one, leaving every user-defined generic uninhabited. This closes that gap
and nothing else.

- A generic value's type arguments come from exactly two sources: arguments
  written at the construction site, or an expected type. There is no third source.
- **Written arguments are authoritative.** They resolve as an ordinary type
  application — exact arity, no defaults, omissions, or partial application — and
  are never adjusted to satisfy the surrounding context. A disagreement with the
  expected type is an ordinary type mismatch, not a re-inference.
- **Contextual construction** takes the arguments from an expected type that is an
  application of the very declaration being built. The accepted contexts are an
  annotated binding, a function's final expression, an explicit `return`, an
  argument position, and a field or payload value. An expectation naming a
  different declaration supplies nothing.
- **The nullable rule is now general.** When the expected type is a nullable
  application of the target declaration, exactly one outer `Nullable` wrapper is
  looked through. The constructed value itself remains non-nullable, and the
  existing non-null-into-nullable rule performs the injection. Exactly one wrapper;
  no other shape is unwrapped.
- Result's nullable contextual construction, accepted for Slice 2B, is hereby
  understood as the **first instance of this general rule** rather than a permanent
  Result-only exception. Result's semantics are otherwise unchanged.
- **Field and payload values are never consulted.** `Box { value: 42 }` with no
  expected `Box<T>` is rejected rather than completed from the literal's type.
  Koda does not invent a type argument, and this introduces no inference variables
  and no constraint solving.
- Member types come from ordinary substitution over the resolved arguments, so
  contextual literal typing continues to apply through them: `Box<Float> { value: 1 }`
  types `1` as a `Float`.
- Nesting is ordinary recursion. An inner construction may be explicit or
  contextual at any finite depth.
- A substituted member type containing `Unit?` remains outside the implemented
  subset at construction, exactly as it already is at member access. That boundary
  is unchanged and still waits on Q08.
- Type arguments have **no runtime representation**. Construction is fully erased:
  `Box<Int>` and `Box<String>` lower identically. No metadata is added, and no Q08
  question is answered by this decision.
- Generic functions, generic calls, generic-call inference, constraints, bounds,
  variance, higher-kinded types and recursive generic data all remain outside this
  decision. `Name<T>(...)` stays rejected as generic-call syntax. Their future
  acceptance is not withdrawn.

See [type-system rules](../spec/type-system.md#constructing-a-generic-value-slice-3a)
and the [implementation boundary](../implementation/slice-3a.md).

## 2026-09-22 — accepted explicit generic functions (Slice 4A)

Approver: repository owner/user, by explicit Slice 4A acceptance and
implementation authorization. This is a clarification of Q11. It selects no Q08
representation, no inference contract, and no constraints feature.

- A function may declare unconstrained type parameters, using the list syntax
  data declarations already use. Parameters belong to the declaring function,
  are in scope across its parameter annotations, return annotation and body, and
  do not escape it.
- Parameter names follow the existing closed-name rules: non-empty list, no
  duplicates, and no primitive or closed prelude name. `Result`, `Ok`, `Err` and
  `Decimal` are unavailable as type-parameter names, aligning functions with the
  rule data declarations already follow.
- **Type arguments are always written.** A generic call supplies exactly the
  declared number. Omission is an error and never a request to infer; there is
  no partial application, no default and no turbofish. A function that declares
  no type parameters rejects type arguments.
- **A generic body is checked exactly once** under its abstract type parameters.
  It is never re-checked per call and never monomorphised.
- An unconstrained type parameter has no known capabilities, so arithmetic,
  equality, ordering, field access and string interpolation on one are rejected.
  This introduces no constraints feature and no implicit capability.
- A call substitutes the written arguments through the declared signature:
  arguments are checked against substituted parameter types, and the call's type
  is the substituted return type. Substitution recurses through nested
  applications and nullable layers exactly as it already does.
- A substituted expected type may drive ordinary contextual construction. That
  is the accepted Slice 3A rule reading a type the programmer wrote, **not**
  generic-function inference.
- Nullable flattening is unchanged; a substitution never produces `T??`. A
  substitution that would produce `Unit?` is rejected, exactly as that type is
  rejected elsewhere. This does not redefine `Unit?` semantics.
- Type-parameter owner identity is the function's `DeclarationId`, from the
  Q05-A allocator. No second owner mechanism is introduced, and a callee's
  parameters can never be captured by a caller's.
- Type arguments have **no runtime representation**. A generic call emits the
  same shape as an ordinary call.
- Generic functions are not values: they cannot be stored, passed or partially
  instantiated, because v0.1 has no first-class functions.
- Constraints, bounds, variance, higher-kinded types and type-argument inference
  remain outside this decision. Their future acceptance is not withdrawn.

See [type-system rules](../spec/type-system.md#generic-functions-slice-4a) and
the [implementation boundary](../implementation/slice-4a.md). The responsibility
rule for an abstract type parameter is recorded in
[ADR 0010](0010-q04-result-obligations.md).

## 2026-09-22 — accepted immutable lists and iteration (Slice 5)

Approver: repository owner/user, by explicit Slice 5 acceptance and
implementation authorization. This is a clarification of Q11. It selects no Q08
representation, no inference contract, and no standard-library design.

- `List<T>` is a prelude type with canonical declaration identity, nominal and
  invariant, applied with exactly one type argument. It reuses the ordinary
  generic nominal representation: no new type kind is introduced. `List` is a
  closed prelude name and cannot be redeclared, shadowed or bound.
- A list is an **immutable value**. There is no element assignment, no in-place
  mutation and no mutable alias. `mut` continues to mean rebinding a name.
- A literal's element type comes from an expected `List<T>` when one exists, and
  otherwise from its **first** element, with every later element checked against
  exactly that type. There is no join, no sibling widening and no unification.
  An expected type reaches each element, so ordinary contextual literal typing
  applies within it.
- `[]` has no element type of its own. The expected type supplies one, through
  the accepted contextual contexts and exactly one outer nullable wrapper.
  Without one it is rejected rather than completed with an invented type.
- Reading is `items.length()`, `items.isEmpty()` and `items.get(index)`.
  **`get` returns `T?`**: an index that names no element, negative indexes
  included, is an *absent value* rather than a failed operation, so it is
  absence and not a `Result`. There is no indexing syntax in v0.1.
- `for` and `in` are reserved words. This is an intentional pre-1.0 source
  compatibility change.
- A `for` iterates a `List<T>`, binds an immutable `T` visible only in the body,
  may not shadow, is a statement with no value, runs zero times on an empty
  list, and permits `if`, `match`, `return` and nesting. `break` and `continue`
  are deferred because they introduce partial-iteration edges.
- Producing a list other than by literal is deferred: `append` and every other
  producer are outside this decision. Their future acceptance is not withdrawn.
- Recursive user-defined data remains rejected, including through a `List`
  field. `type Control { children: List<Control> }` is still invalid.
- Type arguments have no runtime representation; a list lowers to an ordinary
  array with no added metadata.

See [type-system rules](../spec/type-system.md#lists-slice-5) and the
[implementation boundary](../implementation/slice-5.md). The responsibility
rules are recorded in [ADR 0010](0010-q04-result-obligations.md).

## 2026-09-22 — accepted persistent list construction (Slice 6A)

Approver: repository owner/user, by explicit Slice 6A acceptance and
implementation authorization. This is a clarification of Q11 and selects no Q08
representation, no inference, and no mutable collection model.

- `List<T>.append(value: T) -> List<T>` is a compiler-known operation taking
  exactly one argument, checked against the instantiated element type, and
  returning exactly `List<T>`. Invariance is unchanged.
- **`append` is persistent.** It returns a new list and never changes the list
  it was called on. There is no mutating list operation of any kind, and `mut`
  continues to mean rebinding a name.
- Ordinary contextual rules apply to the argument, so numeral retargeting
  inside `xs.append(1)` on a `List<Float>` behaves exactly as it does anywhere
  else. Nested lists, records, enums and nullable element types all follow.
- On a generic `List<T>` receiver, append follows the existing Slice 4A rules
  without change; no generic inference is introduced.
- `prepend`, `concat`, indexing, `map`, `filter`, `reduce` and every other list
  operation remain outside this decision. Their future acceptance is not
  withdrawn.

See [type-system rules](../spec/type-system.md#building-a-list) and the
[implementation boundary](../implementation/slice-6a.md). The responsibility
rule is recorded in [ADR 0010](0010-q04-result-obligations.md).

## 2026-09-22 — accepted string inspection (Slice 6B)

Approver: repository owner/user, by explicit Slice 6B acceptance and
implementation authorization. This is a clarification of Q11, and it partially
lifts this ADR's own deferral of "direct string indexing and length semantics".
It selects no Q08 representation and no foreign-boundary contract.

- Five compiler-known read-only operations on `String`:
  `length() -> Int`, `get(index) -> String?`, `startsWith(prefix) -> Bool`,
  `endsWith(suffix) -> Bool` and `contains(value) -> Bool`.
- **All of them count Unicode scalar values.** `"A<emoji>B".length()` is 3, and
  `get(1)` is the emoji itself. No UTF-16 code-unit length or indexing is
  inherited from JavaScript, and an implementation may not expose one.
- `get` returns the one-scalar string at that position. An index that names no
  scalar, **negative indexes included**, is an absent value, so the result is
  `String?` rather than a `Result`. This follows `List.get` exactly: a position
  that names nothing is absence, not a failed operation.
- `startsWith`, `endsWith` and `contains` match a scalar sequence. Koda strings
  contain no lone surrogates, so a match can never begin or end part-way through
  a surrogate pair.
- Strings remain immutable. These operations only read; none produces a
  modified string, and no string mutation exists.
- Slicing and substrings, splitting, joining, case conversion, trimming,
  replacement, ordering comparison and code-point conversion all remain
  deferred. The wider deferral of a general string library is unchanged.
- These are compiler-known operations for now, for the same reason the list
  operations are: Koda cannot yet express them as library code. That remains
  provisional and is recorded with the Slice 5 asymmetry.

See [type-system rules](../spec/type-system.md#inspecting-a-string-slice-6b)
and the [implementation boundary](../implementation/slice-6b.md).
