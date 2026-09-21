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
