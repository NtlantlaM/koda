# Q02: Numbers and arithmetic failures

State: **AWAITING DECISION**. Selected option: **none**. All subchoices remain pending.
Depends on Q11; informs Q04, Q06, Q08.

## Decision and why it matters

Choose Int's range, Float's domain, literal typing, division/remainder, conversion, and arithmetic faults. JavaScript's representation must not silently define Koda arithmetic. Database IDs and persisted numbers make later changes costly.

## Alternatives

| Option | Model | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Checked safe-range Int: -(2^53-1) through 2^53-1; binary64 Float | Direct ordinary JS Number interop | Unusual range, checks, cannot represent all 64-bit IDs |
| B | Checked signed 64-bit Int, BigInt-backed on JS; binary64 Float | Exact common database width; cross-target consistency | BigInt costs and explicit Number/JSON conversions |
| C | Arbitrary-precision Int, BigInt-backed; binary64 Float | No ordinary integer overflow | Magnitude-dependent CPU/memory; foreign bounds still needed |

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Fixed-width integers; overflow-check settings matter; integer division truncates toward zero and zero division panics. [Operators](https://doc.rust-lang.org/reference/expressions/operator-expr.html) |
| Kotlin | Distinct numeric types, explicit assignment conversions, truncating integer division; overflow may wrap. [Numbers](https://kotlinlang.org/docs/numbers.html) |
| Swift | Ordinary overflow errors; dedicated operators explicitly request wrapping. [Advanced operators](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/AdvancedOperators.md) |
| TypeScript | Distinct number/bigint; number follows binary64 JavaScript Number. [Everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html), [ECMAScript values](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html) |
| Go | Fixed-size types and implementation-sized int; special constant rules; truncating integer division. [Specification](https://go.dev/ref/spec) |
| Python | Unlimited-precision integers; / differs from floor division //. [Numeric types](https://docs.python.org/3/library/stdtypes.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Simple common cases, surprising range | Range/overflow to learn | Intuitive integers, hidden resource costs |
| AI-generated code | Must avoid assumed 64-bit range | Familiar fixed-width assumptions | Python-like arithmetic; conversions often missed |
| Compiler complexity | Exact arithmetic semantics plus checks | BigInt lowering plus bounds | Simpler arithmetic, size/resource limits |
| Runtime performance | Good Number fit, checked intermediates need care | BigInt overhead | Cost grows with magnitude |
| Interoperability | Straightforward checked Number exchange | Database-friendly, JSON needs policy | Per-signature conversion/range checks |
| Compatibility | Widening changes overflow behavior | Stable fixed-width promise | Later bounds would reject valid programs |

## Recommendation, not acceptance

Recommend **A for v0.1**, with **B** preferable if full 64-bit database fidelity is an early requirement. Never round an external ID to fit A; use an explicit lossless domain representation. All refinements are **AWAITING DECISION**.

| Subchoice | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Literals | Token defaults: predictable; expected-type-driven: concise; mandatory suffix: noisy/explicit | Integer token defaults Int, decimal Float; compatible expected type may guide literals, never implicitly convert variables |
| Integer / | Truncate: Rust/Go familiar; floor: Python familiar; exact-only: restrictive | Truncate: -7 / 3 = -2 |
| Integer % | Truncation remainder; floor modulo; separate named APIs | Truncation remainder: -7 % 3 = -1 |
| Overflow/Int zero division | Fatal check: simple; Result operators: verbose; wrap: easy corruption | Source-located fatal operator fault, identical across build modes; checked library alternatives return Result |
| Float domain | IEEE non-finites: interoperable; finite-only: restricted; Result arithmetic: pervasive | Full binary64, including NaN/infinities/signed zero; explicitly document Float zero division separately |
| Conversion | Implicit widening: convenient; checked explicit: visible; named lossy conversion: more surface | Explicit; out-of-range/lossy conversion returns Result |
| Intermediate precision | Rounded result check: needs proof; exact BigInt intermediate: slower; proven special algorithms: complex | Specify exact Int mathematics; backend may optimize only with equivalent results |
| Known faults | Runtime only: late; compile-time where known: helpful | Reject invalid literals/known constant faults during checking |

Before approval, decide bounds, max+1, negative division/remainder, zero divisors, NaN equality, conversions, and foreign out-of-range input. Performance effects are qualitative, not benchmark claims.
