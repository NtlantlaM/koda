# Q02: Numbers and arithmetic failures

State: **ACCEPTED** by explicit user decision on **2026-09-20**. Recorded in [ADR 0008](../../decisions/0008-q02-numeric-semantics.md).
Depends on accepted Q11; constrains Q01, Q04, Q06, Q07, Q08, and later persistence under Q09 without resolving them.

## Decision and context

Use backend-independent checked signed-64-bit Int and IEEE-754 binary64 Float. The JavaScript backend must implement Koda semantics, not redefine them around Number. Preserve production integer data, require explicit typed numeric conversions, and validate foreign/serialization boundaries. Decimal is reserved but unusable in v0.1.

The complete accepted rules are in [Numeric semantics](../../spec/numbers.md), including literal context, exact/rounded/truncating conversions, comparison, fault handling, text, JSON, and future database mappings. API names and lexical spelling dependent on Q01 remain deferred; notation in examples is illustrative, not a permanent API declaration.

## Resolution of all 20 decisions

| Issue | User selection | Accepted meaning |
| --- | --- | --- |
| S01 | B | Exact fallible and explicit nearest/ties-even rounded Int-to-Float operations |
| S02 | B | Exact and explicitly truncating Float-to-Int operations with finite/range checks |
| S03 | B | Result conversion failures; closed non-finite/out-of-range/inexact categories |
| S04 | A | NaN ordering comparisons false; primitive IEEE equality |
| S05 | A | Float overflow to signed infinity; gradual underflow and signed zero |
| S06 | User amendment | Correct rounding nearest/ties-even; literal underflow-to-zero allowed, optional warning; finite literal overflow to signed infinity consistently with runtime overflow |
| S07 | B | Named special-value constants/predicates and explicit serialization policy; names deferred |
| S08 | A | Mixed typed numeric equality/ordering requires explicit conversion |
| S09 | B | Integer bases/separators and decimal Float exponent notation; precise spelling Q01 |
| S10 | B, remainder amendment | Signed minimum literal formation; checked typed negation/division; minimum Int remainder -1 is zero |
| S11 | A | Exponentiation deferred |
| S12 | B | Declared checked Number/BigInt adapters with conservative default Number-to-Int |
| S13 | B | Explicit JSON schema codecs; safe default and opt-in lossless profiles |
| S14 | B, staged | Numeric persistence contract accepted; implementation deferred until persistence |
| S15 | B | Exact source literal retained until contextual/default typing; no typed-value retargeting |
| S16 | A | Small operator set, per-operation Float rounding, observable evaluation preserved |
| S17 | User amendment | Source-located checked faults; reject faults in required constant evaluation, without a blanket unreachable ordinary-branch rule |
| S18 | User direction | Reserve Decimal; no usable v0.1 type/runtime semantics; reservation spelling deferred |
| S19 | B | Canonical locale-independent, round-trip text and strict parsing |
| S20 | A | No observable NaN payload/signaling bits; total order/hash/bit APIs deferred |

## Amendments and scope

S06 replaces the former recommendation to reject finite literals rounding to infinity or nonzero literals rounding to zero. Parsing is correctly rounded nearest/ties-to-even; finite literal overflow produces signed infinity consistently with runtime Float overflow, and underflow may produce signed zero with an optional warning.

S17 replaces the former blanket invalid-subtree rule. Source-located checked arithmetic faults and rejection in semantically required constant evaluation are accepted. A faulty arithmetic expression in a provably unreachable ordinary branch is not necessarily a compile-time error. Required constant contexts/evaluation and ordinary reachability diagnostics must be documented separately.

S10 explicitly chooses minimum Int remainder -1 equal to zero. S14 accepts the adapter semantics while deferring implementation until persistence. S18 reserves Decimal without v0.1 runtime semantics and leaves its reservation mechanism to Q01.

See [ADR 0008's explicit deferrals](../../decisions/0008-q02-numeric-semantics.md#explicit-deferrals-and-unresolved-integration) and [future conformance obligations](../../../tests/numeric-conformance.md). No other question changes state, and no implementation is authorized.

## Established language comparisons retained for context

These are precedents, not decisions for Koda. The original comparisons remain useful even though the accepted model uses signed 64-bit Int instead of the initial safe-range candidate.

| Language | Approach |
| --- | --- |
| Rust | Fixed-width integers; overflow-check settings matter; integer division truncates toward zero and zero division panics. [Operators](https://doc.rust-lang.org/reference/expressions/operator-expr.html) |
| Kotlin | Distinct numeric types, explicit assignment conversions, truncating integer division; overflow may wrap. [Numbers](https://kotlinlang.org/docs/numbers.html) |
| Swift | Ordinary overflow errors; dedicated operators explicitly request wrapping. [Advanced operators](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/AdvancedOperators.md) |
| TypeScript | Distinct number/bigint; number follows binary64 JavaScript Number. [Everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html), [ECMAScript values](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html) |
| Go | Fixed-size types and implementation-sized int; special constant rules; truncating integer division. [Specification](https://go.dev/ref/spec) |
| Python | Unlimited-precision integers; / differs from floor division //. [Numeric types](https://docs.python.org/3/library/stdtypes.html) |

## Impact of the accepted direction

| Dimension | Expected benefit | Cost or risk |
| --- | --- | --- |
| Beginners | Stable Int range, explicit conversion intent, consistent checked faults | Binary64 approximation and exact-versus-rounded APIs need clear teaching |
| AI-generated code | Fixed backend-independent rules and actionable conversion errors | Models may assume JS Number or silently cast large IDs; boundary checks must reject mistakes |
| Compiler complexity | One language-level Int contract; no implicit promotion lattice | Precise literals, constant evaluation, bounds checks, and cross-backend Float conformance require work |
| Runtime performance | Fixed-size Int semantics can map efficiently on native backends | JS BigInt/checks may cost more than Number; conversion and codec validation add work |
| Interoperability | Full signed-64-bit data can survive lossless boundaries | Number-based libraries, JSON readers, and database drivers need explicit contracts |
| Compatibility | Stable type ranges avoid backend-dependent APIs | Error variants, literal grammar, rounding, serialization, and ordering become long-term commitments |

These are design assessments, not benchmarks or measured AI-quality claims.
