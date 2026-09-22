# Documentation index and authority

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

The specifications define Koda independently of any compiler implementation. This is an initial design baseline, not a claim of a complete or implemented language.

A specification is authoritative over the implementation, never the other way round. Where [compiler slice 0](implementation/slice-0.md) behaves in a way no accepted decision fixes, that is a provisional implementation choice recorded in its own document, and it does not settle the owning question.

| Document | Responsibility |
| --- | --- |
| [Language](spec/language.md) | Principles, scope, evaluation model |
| [Syntax](spec/syntax.md) | Lexical rules, proposed grammar, precedence |
| [Type system](spec/type-system.md) | Inference, mutability, null safety, enums, results |
| [Numbers](spec/numbers.md) | Accepted numeric semantics, conversions, and boundaries |
| [Diagnostics](spec/diagnostics.md) | Stable diagnostic identity, human and machine output |
| [Entities and persistence](spec/entities-and-persistence.md) | Persistent data boundaries and explicit effects |
| [Project structure](spec/project-structure.md) | Modules, manifest, CLI and package policy |
| [JavaScript/npm interoperability](spec/javascript-interop.md) | Foreign declarations and runtime boundaries |
| [Compiler architecture](architecture/compiler.md) | TypeScript implementation and JavaScript backend |
| [Toolchain layout](../packages/README.md) | Package responsibilities |
| [Conformance strategy](../tests/README.md) | Acceptance tests and the planned coverage |
| [Feature statuses](design/feature-status.md) | Canonical feature classification and delivery scope |
| [Open questions](design/open-questions.md) | Q01, Q02, Q03, Q04 and Q11 ACCEPTED; Q05–Q10 and Q12–Q13 remain AWAITING DECISION |
| [Specification review](design/specification-review.md) | Complete baseline review, missing choices, relocation verification |
| [ADRs](decisions/README.md) | Rationale and consequences |
| [Compiler slice 0](implementation/slice-0.md) | The first executable slice, and the provisional choices it had to make |
| [Compiler slice 1A](implementation/slice-1a.md) | User-defined data: types, records, field access, enums, variants, payloads |
| [Compiler slice 1B](implementation/slice-1b.md) | Match and enum patterns: variant patterns, payload bindings, exhaustiveness |
| [Compiler slice 1C](implementation/slice-1c.md) | Nullability: `T?`, `null`, nullable match, null-check refinement |
| [Compiler slice 2A](implementation/slice-2a.md) | Generic data declarations, concrete type applications and substitution; no Result or generic functions |
| [Compiler slice 2B](implementation/slice-2b.md) | Result values and matching: prelude Result, Ok/Err, contextual construction |
| [Compiler slice 2C](implementation/slice-2c.md) | Result must-handle analysis: discard, outstanding obligations, transfer, overwrite |
| [Compiler slice 3A](implementation/slice-3a.md) | Generic value construction: explicit and contextual type arguments, no inference |
| [Roadmap](roadmap.md) | Stages, dependencies, and exit criteria |

## Reading status correctly

The status register is authoritative for feature classification. Specifications supply semantics; ADRs explain why a decision was made. An unresolved item explicitly listed in the open questions is not settled by an illustrative example. A conflict between documents is a design defect to resolve, not permission for an implementation to pick either interpretation.

ACCEPTED means an accepted design direction, not shipped functionality or necessarily finalized spelling. Documents distinguish accepted semantic requirements from experimental syntax and unresolved details. Compiler behavior must eventually be checked against a versioned, frozen specification and conformance suite.

- [Slice 3B: structural Result obligations](implementation/slice-3b.md) records
  execution-path correctness, structural tracking and conditional payload completion.

- [Slice 3C: core correctness repairs](implementation/slice-3c.md) records
  operand evaluation order, extreme numeric literals and nested-block newlines.

- [Slice 5: immutable lists and iteration](implementation/slice-5.md) records
  `List<T>`, literals, `get`/`length`/`isEmpty`, `for` loops and the collective
  responsibility rules R1/R2/R3.

- [Slice 4A: explicit generic functions](implementation/slice-4a.md) records
  generic declarations, explicit generic calls, call-site substitution and the
  conservative responsibility rule for an abstract type parameter.

- [Q05-A: declaration identity foundation](implementation/q05a-identity-foundation.md)
  records the module-safe declaration identity that nominal typing, generic
  owners and canonical `Result` now rest on. Behaviour-preserving; the
  user-visible module system is not part of it.
