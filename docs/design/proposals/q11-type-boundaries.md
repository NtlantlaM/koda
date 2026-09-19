# Q11: Type boundaries, inference, nulls, and strings

State: **AWAITING DECISION**. Selected option: **none**. All refinements inherit this state.

## Decision and why it matters

Choose type identity, inference boundaries, generics, nullable refinement, equality, and string semantics. The baseline's nominal records and several restrictions were recommendations, not consequences of strong typing. These rules determine accepted programs and future API compatibility.

## Alternatives

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

## Recommendation, not acceptance

Recommend **A**, keeping v0.1 small and its correctness explainable. Each subchoice below is separately **AWAITING DECISION**; the recommendation does not close it.

| Subchoice | Viable alternatives and tradeoffs | Recommended candidate |
| --- | --- | --- |
| Signatures | All annotated: clear; exported-only: concise; broad inference: body-dependent APIs | Annotate parameters/returns, infer locals/calls |
| Generics | Built-ins only: minimal; small user generics: useful; constrained/variant: expressive/complex | Small invariant user generics; reject ambiguous inference |
| Null refinement | Match only: simple; stable-binding if checks: convenient; alias-aware flow: powerful/complex | Match only initially |
| Nested nullable | Flatten: simple; preserve layers: expressive/boxed; reject nullable substitution: restrictive | Flatten generic substitution; diagnose written T??; enums distinguish multiple absence meanings |
| Equality | Primitive only: minimal; derived data equality: convenient; trait-based: extensible | Primitive equality initially, no observable record identity |
| Strings | Scalar sequences: portable; UTF-16 code units: JS fit; graphemes: human-facing/costly | Scalar sequences, exact non-normalizing equality; reject lone surrogates at foreign boundaries; defer indexing/length API |
| Shadowing | Allow: concise; warn: flexible; reject locals/parameters: unambiguous | Reject local/parameter shadowing and same-scope duplicates |
| Recursive data | Defer: simplest; guarded recursion: useful; arbitrary recursive types: complex | Defer recursive data; allow ordinary function recursion |
| Scope | Small synchronous core; add traits/collections now; only built-in generics | Small core with user generics; explicitly confirm all proposed deferrals |

Before approval, compare same-shaped named records, ambiguous generic calls, nullable substitution, shadowing, and canonically equivalent text. Q01 determines spelling after semantics are chosen.
