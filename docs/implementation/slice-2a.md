# Compiler slice 2A — generic data-type foundations

This document separates accepted rules from implementation choices. The human
authorization selects source-visible generic record/enum declarations and concrete
type applications, not full generics. ADR 0007 and ADR 0011 record the accepted
2026-09-21 clarifications. No new ADR or Q08 decision is made.

## Scope

Building on [Slice 1C](slice-1c.md), this slice supports generic data declarations,
declaration-local type parameters, nested concrete type applications, recursive
substitution in type descriptions, invariant nominal identity, nullable flattening,
and the conservative recursive-data rejection boundary. It is testable through
source annotations, nongeneric function signatures, fields and payload descriptions.

Generic construction, generic functions, explicit generic calls, generic-call
inference, constraints, Result/Ok/Err and must-handle analysis are excluded.
Slice 2B owns Result values/matching; Slice 2C owns Result obligations.

The existing Slice 1C `Unit?` runtime boundary remains: a generic declaration may
describe `T?`, but reading a field or binding a payload whose substitution exposes
`Unit?` is unsupported. Slice 2A does not choose how present Unit differs from
absence. Unused generic descriptions do not require a runtime representation.

## Implementation and validation

The AST retains declaration parameters and nested type references, distinguishing
omitted arguments from an explicit empty list. Data shells are declared before
member resolution. Each parameter has its owning declaration ID and source-order
index, with a diagnostic span. Owner IDs are deterministic within the existing
single-module compiler; multi-module identity remains future Q05 integration.

Record/enum types carry their declaration and ordered arguments. Equality of
type descriptions compares those identities recursively, without nullable
injection inside arguments. Ordinary outer nullable injection is unchanged.
Substitution replaces only parameters of the selected owner, recursively visits
type arguments, and normalizes nullable wrappers. It does not expand members or
mutate shared declaration templates. Field reads and existing enum pattern
bindings obtain substituted types; no generic constructor is introduced.

Recursive-data detection walks stored type descriptions through nullable wrappers
and application arguments, then checks declaration dependency cycles. Changing
arguments cannot disguise a cycle. No member expansion or instantiation cache is
needed, so transformed recursion terminates. Finite use-site nesting is not a
cycle. This also closes the prior implementation gap where nullable wrappers
were not traversed despite the documented recursive-data deferral.

The parser recognizes explicit generic calls/construction only to reject them
with an unsupported-feature diagnostic, rather than treating them as comparison
chains. Malformed lists and written `T??` remain syntax errors. Candidate
`KODA-T0011` reports arity errors; existing duplicate-name, unresolved-name,
type-mismatch and unsupported-feature codes handle the other cases. Q07 still
owns the final registry and machine schema.

No new IR node, JavaScript lowering, or runtime helper was necessary. Existing
field reads and enum matching use the same provisional backend operations with
their newly substituted static types. No runtime erasure, reification,
specialization or public ABI is accepted. Generic construction and generic
function implementation must return to the relevant unresolved decisions.

## Coverage

Each source fixture has a `.diags` partner; empty means successful checking.

| Fixture/test | Coverage |
| --- | --- |
| `tests/types/generic-foundations.ko` | Records/enums, multiple parameters, fields/payloads, nested applications and substitution, nullable arguments/outer applications, `T?` flattening, annotations, ordinary function signatures and local inference, existing refinement/matching |
| `tests/syntax/generic-layout.ko` | Multiline lists, trailing commas, nested type applications |
| `tests/types/generic-scopes.ko` | Independent binders with the same spelling, declaration-local resolution, no added module-name collision policy |
| `tests/types/generic-identity.ko` | Invariance, nominal identity, ordered and unused arguments, identical normalized fields retaining distinct outer types, nullable placement, joins and no numeric widening |
| `tests/types/generic-arity.ko` | Missing/empty/few/many arguments, primitive and nongeneric applications, unknown argument types, enum applications, parameters not being type constructors |
| `tests/types/generic-parameters.ko` | Duplicate names, primitive/prelude collisions, unknown parameters, no global leakage |
| `tests/types/generic-recursion.ko` | Direct, mutual, transformed, enum, argument-mediated and nullable recursion rejection |
| `tests/types/generic-construction.ko` | Generic record/enum construction rejected even with an expected concrete type |
| `tests/syntax/generic-rejected.ko` | Empty/malformed lists, bounds/defaults, generic functions/calls/construction, repeated nullable suffixes |
| `packages/compiler/test/generics.test.ts` | Binder identity, template preservation, normalization/invariance, deterministic compilation/diagnostics, no artifacts on errors, JSON spans, Result exclusions, deferred Unit? boundary, malformed-input recovery |
| `packages/cli/test/generics.test.ts` | Real CLI JSON, deterministic output directories, entry execution, no artifacts on failure, previous successful artifacts preserved |

The existing rejected-forms fixture no longer expects errors for generic data
declarations. Its remaining syntax errors are unchanged. All prior execution
fixtures continue to exercise nongeneric data, matching, null refinement and
numeric semantics. Generic values are not fabricated for execution tests.

Validation: **72 tests pass, 0 fail**, including all **10 existing execution
fixtures**, the checked-fault reporting test and three new CLI contract tests.
Run `npm run clean` followed by `npm test` for a clean TypeScript rebuild and the
full suite. Deterministic artifact checks, failed-build/no-artifact checks and
JSON checks are automated in that suite. Documentation links, decision state and
whitespace are checked separately. The baseline was 50 passing tests.

## Stale material reconciled and remaining boundaries

Current README/index/status/specification wording now distinguishes accepted
language decisions from implemented slices. Obsolete `let` examples and Q01
pending-syntax claims in the touched current material were corrected. CLI help
no longer claims records/enums/nullability/generics are wholly unimplemented.
Historical proposals and earlier slice descriptions remain historical; they do
not override the accepted follow-ups in ADR 0007 and ADR 0011.

Result values/matching remain Slice 2B and obligations remain Slice 2C. Generic
functions, generic-call inference, construction spelling, defaults, constraints,
variance, recursive data, complete namespaces, runtime generic strategy and
multi-module/foreign integration are not implemented or newly decided here.

---

Generic **construction** — building a value of one of these types — lands in
[slice 3A](slice-3a.md). Until then every user-defined generic type is
well-typed and uninhabited.
