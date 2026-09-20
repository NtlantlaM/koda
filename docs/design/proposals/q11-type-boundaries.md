# Q11: Type boundaries, inference, nulls, and strings

State: **ACCEPTED**. Approved by the user on **2026-09-20**.

Decision record: [ADR 0007](../../decisions/0007-q11-type-boundaries.md). The accepted decision is the explicit policy below, not wholesale acceptance of historical option A or its former recommendations. Other open questions remain AWAITING DECISION.

## Decision and why it matters

Q11 decides type identity, inference boundaries, generics, nullable refinement, equality, string semantics, shadowing, and recursion. These rules determine accepted programs and future API compatibility. The user has now selected the following rules explicitly.

## Accepted decision

| Area | Accepted rule |
| --- | --- |
| Type identity | Koda-defined types use nominal identity. |
| Function boundaries | Explicit parameter and return types are required. |
| Inference | Local variable and call-result types are inferred. |
| Generics | Small invariant user-defined generics are supported in v0.1; variance and advanced generic constraints are deferred. |
| Nullable values | Support `T?`; reject explicitly written `T??`. Flatten nullable generic substitution where necessary so nested nullable layers are not observable language semantics. |
| Null refinement | Support `match` and explicit null checks on stable immutable local bindings. Do not provide alias-aware mutable smart casts in v0.1. |
| Equality | Support primitive equality in v0.1. Do not expose reference/object identity. Defer derived equality for user-defined value types; entity identity/equality belongs to the later persistence decision. |
| String values | Unicode scalar-value semantics, with exact, non-normalizing equality. Reject invalid/lone surrogate values at foreign boundaries. |
| String forms | Support string interpolation and multiline strings. Direct indexing and length semantics are deferred. |
| Names | Reject local and parameter shadowing, including same-scope duplicate declarations. |
| Recursion | Allow ordinary function recursion; defer recursive user-defined data types. |

## Rationale and consequences

Nominal identity and explicit function signatures make domain boundaries visible while inference keeps local code concise. Invariant generics provide reusable typed data without committing v0.1 to variance or advanced constraints. Stable immutable locals permit useful null-check refinement without alias-aware mutable flow analysis.

Nullable substitution has one observable absence layer; explicitly writing a second suffix is an error. Primitive equality is available without introducing object identity or choosing persistence identity. Unicode scalar values and exact equality establish portable text semantics, while foreign boundaries must reject invalid values. Interpolation and multiline strings are supported features, but their spelling and detailed conversion/layout rules still need Q01 and related design work.

Shadowing restrictions keep names unambiguous. Function recursion is available independently of recursive user-defined data types. The compiler will eventually need checks for these rules, but this decision does not authorize implementation.

## Explicit deferrals and boundaries

- Variance and advanced generic constraints are deferred.
- Alias-aware mutable smart casts are not provided in v0.1.
- Derived equality for user-defined value types is deferred.
- Entity identity/equality remains a later persistence decision under Q09.
- Direct string indexing and length semantics are deferred.
- Recursive user-defined data types are deferred.

Q01 still determines interpolation markers, multiline delimiters, escaping, indentation/newline handling, and relevant expression syntax; interpolation conversion rules must also be specified without implicitly accepting coercions. Q02 numeric semantics, Q03 mutation/aliasing, Q04 Result handling, Q06 foreign error reporting, and Q08 runtime representations remain unresolved. Q11 does not select additional null-refinement forms, type/value namespace rules, or broader release scope from the former recommendations.

## Historical alternatives considered

These alternatives and the comparisons below preserve proposal context. They are not the accepted policy; in particular, the user accepted stable-local null-check refinement as well as match refinement, and accepted interpolation and multiline strings.

| Option | Policy | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Small nominal core, annotated function boundaries, inferred locals/calls, invariant generics, match-based narrowing | Predictable domain boundaries and diagnostics | More annotations; limited generic operations |
| B | Nominal core with traits/constraints, variance, and smart casts in v0.1 | More reusable APIs and convenient refinement | Much larger checker and mutation/refinement interactions |
| C | Structural records with explicit nominal domain wrappers and flow inference | Easy data composition and JS-shaped values | Accidental domain substitution; harder inferred-type explanations |

All preserve strong typing, type, T?, Result, and associated-data enums.

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Generic bodies rely on declared bounds; monomorphization can specialize uses. [Generics](https://doc.rust-lang.org/book/ch10-01-syntax.html) |
| Kotlin | Variance/bounds support APIs; nullable smart casts have stability restrictions. [Generics](https://kotlinlang.org/docs/generics.html), [null safety](https://kotlinlang.org/docs/null-safety.html) |
| Swift | Protocol constraints support generics; String equality recognizes canonical Unicode equivalence. [Generics](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/Generics.md), [strings](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/StringsAndCharacters.md) |
| TypeScript | Primarily structural compatibility, including documented soundness tradeoffs. [Compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html) |
| Go | Defined types have identity; interfaces provide structural satisfaction; generic operations require suitable constraints. [Specification](https://go.dev/ref/spec) |
| Python | Runtime does not enforce type annotations; Protocol supports structural static typing. [Typing](https://docs.python.org/3/library/typing.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Explicit boundaries, more typing | Convenient casts, more concepts | Familiar shapes, surprising compatibility |
| AI-generated code | Stable signatures constrain guesses | More abstraction/constraint mistakes possible | Easy object synthesis, easy domain confusion |
| Compiler complexity | Lowest here | Highest: bounds, variance, flow state | Structural comparison and flow analysis |
| Runtime performance | Nominality need not cost runtime | Depends on specialization/dictionaries | Static structural checks need not cost runtime |
| Interoperability | Explicit codecs | Traits can wrap foreign APIs | Natural shapes still need validation |
| Compatibility | Can add richer abstractions later | Large early semantic commitment | Switching to nominal later breaks programs |

## Recommendation history

The original recommendation was option A with match-only refinement; it did not include the user's interpolation and multiline-string approvals. The user selected the explicit policy above instead. The former recommendation and its broader scope suggestions are not independently accepted. See ADR 0007 for the authoritative decision and its limits.
