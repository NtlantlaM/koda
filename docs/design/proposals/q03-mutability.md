# Q03: Mutation and aliasing

State: **AWAITING DECISION**. Selected option: **none**. All refinements remain pending.
Depends on Q11; informs Q04, Q06, Q08, Q10.

Q11 is ACCEPTED via [ADR 0007](../../decisions/0007-q11-type-boundaries.md): no reference/object identity is exposed, and alias-aware mutable smart casts are excluded from v0.1. These are fixed constraints, not pending Q03 refinements; mutation and aliasing policy remain AWAITING DECISION.

## Decision and why it matters

Does mut permit rebinding, field updates with value semantics, or ownership-controlled mutation? Specify nested values and aliases. Immutable bindings alone do not guarantee immutable objects; this affects trust in generated code and future concurrency.

## Alternatives

| Option | Model | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Immutable record/enum contents; mut only rebinds whole values | No mutable alias surprises; simple checker | Verbose record reconstruction; update allocations |
| B | Mutable value semantics: mut permits field updates, copies appear independent | Convenient updates without shared mutation | Correct copying/copy-on-write for nested data is complex |
| C | Ownership/borrow-controlled mutation with exclusive access | Efficient in-place updates and checked aliasing | Lifetimes/borrowing greatly expand the language |

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Exclusive mutable borrowing constrains aliases; shared references restrict ordinary mutation. [Borrowing](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html) |
| Kotlin | val versus var controls property reassignment, not deep immutability of referenced objects. [Properties](https://kotlinlang.org/docs/properties.html) |
| Swift | Structs/enums have value semantics; classes have reference semantics; constant structs cannot have properties changed. [Structures and classes](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/ClassesAndStructures.md) |
| TypeScript | readonly is a checking restriction, not runtime freezing; aliases can expose mutation. [Objects](https://www.typescriptlang.org/docs/handbook/2/objects.html) |
| Go | Struct values and pointers distinguish copying from shared access; reference-bearing fields can still share data. [Effective Go](https://go.dev/doc/effective_go) |
| Python | Names bind objects; object types determine mutability and multiple names can alias an object. [Data model](https://docs.python.org/3/reference/datamodel.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Clear replacement model | Convenient updates, copy rules to learn | Substantial ownership concepts |
| AI-generated code | Accidental field updates diagnosed | Risk of assuming reference behavior | More borrow/lifetime repair cases |
| Compiler complexity | Low for core data | Medium/high mutation lowering | High ownership/lifetime analysis |
| Runtime performance | Cheap immutable sharing, allocating updates | Copies/COW may cost time | In-place updates can be efficient |
| Interoperability | Validate/copy foreign objects | Boundary copies preserve value semantics | Foreign ownership difficult to prove |
| Compatibility | Later mutation can be explicitly distinct | Early copying/identity promise | Ownership permeates API design |

## Recommendation, not acceptance

Recommend **A**. This is an observable guarantee, not a mandate to recursively freeze every emitted object. Internal sharing is fine if callers cannot observe mutation.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Updates | Reconstruction: simple/verbose; with-expression: concise/new grammar; mutable fields: different model | Reconstruction initially |
| Nested fields | Deep immutable core values: strong; shallow: easier/alias risk; capabilities: expressive/complex | All reachable core data immutable; defer foreign mutable handles inside records |
| Enforcement | Compiler-only: fast; runtime freeze: defense/cost; boundary copy/validation: interop cost | Compiler internally, checked/copied boundary representations when object interop arrives |
| Parameters | Immutable: clear; mutable parameter spelling: convenient; inferred mutation: less visible | Immutable parameters, explicit mutable local for rebinding |

Before approval, decide b = a followed by rebinding a, attempted a.field assignment, nested updates, and a foreign function retaining a reference. Distinguish semantic copying from physical copying.
