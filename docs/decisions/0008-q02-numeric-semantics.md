# 0008: Q02 backend-independent numeric semantics

Date: 2026-09-20

Status: **ACCEPTED** by explicit user decision.

Resolves: [Q02](../design/proposals/q02-numbers.md). Normative semantics: [Numbers](../spec/numbers.md). Verification plan: [numeric conformance](../../tests/numeric-conformance.md).

Supersedes: Q02's safe-JavaScript-integer baseline and provisional recommendations, including S06's former literal overflow/underflow rejection and S17's former blanket rejection of invalid arithmetic subtrees in unreachable branches. Q11 / ADR 0007 is preserved. No other open question is accepted.

## Decision

Use checked signed 64-bit Int and IEEE-754 binary64 Float independently of backend. Exact literal contextual typing precedes typed values; typed Int/Float never implicitly convert, including comparisons. Use truncating integer division/remainder, checked integer faults, explicit conversion intent, binary64 rounding and special values, validated foreign/serialization boundaries, and no build-mode-dependent arithmetic.

The exact selection record is:

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

## Rationale

Signed 64-bit semantics preserve common production integer data without letting a JavaScript implementation constrain the language. Explicit conversions reveal precision loss and prevent mixed arithmetic or comparisons from silently rounding identifiers. Binary64 has a clear operational model; applying the same overflow and underflow behavior to literals and runtime operations avoids an inconsistent second Float domain. NaN and signed zero need precise comparison rules, not accidental host behavior.

Source-located faults preserve checked arithmetic across builds. Required constant evaluation must reject invalid arithmetic, while ordinary unreachable code is a separate diagnostic/control-flow question: optional optimizer knowledge must not silently redefine arithmetic. Explicit schema/adapter contracts protect numeric values across JSON and database implementations with different precision and special-value behavior.

## Consequences

- Beginners get stable ranges and explicit failures, but must learn exact versus rounded/truncating conversions and binary64 approximation.
- AI-generated code faces the same compiler rules; TypeScript-style coercion and unchecked foreign numbers cannot bypass validation.
- The future compiler needs exact source-numeral handling, contextual inference, required constant evaluation, Int checks, and per-operation binary64 conformance. JavaScript Int storage remains a Q08 choice; correctness may cost more than raw Number operations.
- Numeric boundaries add validation and codec work. Full-range Int interchange requires explicit lossless transport; default interoperable JSON intentionally rejects unsafe integer magnitudes.
- Ranges, error categories, rounding, comparison, and boundary semantics become compatibility commitments. Public spellings remain uncommitted so Q01 can settle them coherently.

## Explicit deferrals and unresolved integration

Beyond v0.1: exponentiation; Float remainder; bitwise operations/shifts and unsigned arithmetic; transcendental functions; hexadecimal Float literals and typed numeric suffixes; advanced Float bit APIs; total ordering; numeric hashing/map-key rules; additional rounding modes and Float trap/flag controls; observable NaN payload/signaling APIs; Decimal representation, precision, scale, literals, conversions, and arithmetic.

Until persistence: numeric database adapter implementation, capabilities, SQL expression/aggregate/nullability contracts, and database round-trip behavior. Q09 still decides persistence and entity identity/equality; S14 accepts only numeric constraints.

Until Q01/specification completion: exact numeric prefix/separator/exponent/sign/parenthesis grammar; Decimal reservation mechanism; special-value and canonical text tokens; conversion/checked-operation/parse/format/predicate/constant names and spelling; interpolation syntax. No permanent API names are invented here.

Remaining integration: Q04/Q06 error names, payloads and boundary wrapping; Q06 foreign declarations, codec APIs/tag layouts, delivery scope, and arbitrary wider-than-Int BigInt-to-Float adapter overflow policy; Q08 private representation/ABI; Q07 fault reporting/exit codes, optional warning details and evaluator resource diagnostics. Required constant-expression contexts/evaluation subset and ordinary unreachable-code diagnostics must be documented separately before implementation of those facilities. Accepted arithmetic semantics do not depend on these spellings or implementation choices.

## Scope

Only Q02 changes from AWAITING DECISION to ACCEPTED. Q11 remains ACCEPTED; Q01, Q03–Q10, Q12, and Q13 remain AWAITING DECISION. This decision adds documentation and future conformance obligations only, with no lexer, parser, compiler, runtime, CLI, package manager, or adapter implementation.
