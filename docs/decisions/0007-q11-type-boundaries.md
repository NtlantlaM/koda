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

## Explicitly deferred features

- Variance and advanced generic constraints.
- Alias-aware mutable smart casts in v0.1.
- Derived equality for user-defined value types.
- Entity identity/equality, to the later persistence decision Q09.
- Direct string indexing and length semantics.
- Recursive user-defined data types.

## Scope boundary

Only Q11 is resolved. Q01–Q10 and Q12–Q13 remain **AWAITING DECISION**. Numeric behavior, mutation/aliasing, Result obligations, modules, foreign API/error contracts, runtime representation, tool protocols, concurrency, persistence, licensing, and publication policy are not selected here. Additional refinement forms and namespace rules are not inferred from this decision. No lexer, parser, compiler, runtime, CLI, or package-manager implementation is authorized.
