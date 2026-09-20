# Documentation index and authority

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

The specifications define Koda independently of any compiler implementation. This is an initial design baseline, not a claim of a complete or implemented language.

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
| [Toolchain layout](../packages/README.md) | Future package responsibilities |
| [Conformance strategy](../tests/README.md) | Future acceptance tests |
| [Feature statuses](design/feature-status.md) | Canonical feature classification and delivery scope |
| [Open questions](design/open-questions.md) | Q11 and Q02 ACCEPTED; eleven other proposals remain AWAITING DECISION |
| [Specification review](design/specification-review.md) | Complete baseline review, missing choices, relocation verification |
| [ADRs](decisions/README.md) | Rationale and consequences |
| [Roadmap](roadmap.md) | Stages, dependencies, and exit criteria |

## Reading status correctly

The status register is authoritative for feature classification. Specifications supply semantics; ADRs explain why a decision was made. An unresolved item explicitly listed in the open questions is not settled by an illustrative example. A conflict between documents is a design defect to resolve, not permission for an implementation to pick either interpretation.

ACCEPTED means an accepted design direction, not shipped functionality or necessarily finalized spelling. Documents distinguish accepted semantic requirements from experimental syntax and unresolved details. Compiler behavior must eventually be checked against a versioned, frozen specification and conformance suite.
