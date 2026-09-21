# Numeric semantics

Status: **ACCEPTED** by [Q02](../design/proposals/q02-numbers.md) and [ADR 0008](../decisions/0008-q02-numeric-semantics.md), 2026-09-20. This document fixes semantics, not implementation or permanent API spelling. Q01 still owns lexical spelling, declarations, and API notation. Names for conversion operations, error variants, predicates, constants, and codecs below are descriptions, not declared public members.

## Types and operators (S04, S05, S08, S16)

`Int` is a checked signed 64-bit integer, from -9223372036854775808 through 9223372036854775807 inclusive, on every backend. `Float` is IEEE-754 binary64, including NaN, positive/negative infinity, positive/negative zero, and subnormals. JavaScript storage choices do not define either type. Behavior is identical across build modes and deterministic across backends at the observable language level.

Int supports addition, subtraction, multiplication, division, remainder, and unary negation. Float supports addition, subtraction, multiplication, division, and unary negation. Both support same-type equality and ordering. Already typed Int and Float values never implicitly convert: mixed arithmetic, equality, and ordering require explicit conversion. Contextual literal typing happens before a value receives its type and is not a typed-value conversion.

Int operations check their mathematical result against the signed 64-bit range; there is no wrapping. Division truncates toward zero. Remainder is defined mathematically by `a = trunc(a / b) * b + r`, has the dividend's sign when nonzero, and has magnitude less than the divisor's magnitude. This identity does not promise that evaluating its intermediates as Int operations succeeds.

Float basic operations round to binary64 after each operation using nearest/ties-to-even. Overflow produces signed infinity; gradual underflow passes through subnormals and may produce signed zero. Finite nonzero values divided by signed zero produce appropriately signed infinity; zero divided by zero and infinity divided by infinity produce NaN. These are valid Float results, not Int-style arithmetic faults. No implicit fused multiply-add, excess precision, reassociation, or flush-to-zero may change observable results. Preserve expression evaluation order and evaluate effectful operands exactly once; optimization cannot erase an observable Int fault such as the overflow in `(Int.MAX + 1) - 1` (limit names here are descriptive).

NaN is unequal to itself; every ordering comparison involving NaN (`<`, `<=`, `>`, `>=`) is false. Inequality complements equality. Positive and negative zero compare equal, and neither is less than the other, although their sign remains observable through arithmetic. Infinities otherwise follow numeric ordering. This does not establish total ordering or map-key/hash semantics.

## Literal meaning and contextual typing (S06, S09, S10, S15)

Integer literals default to Int. Decimal-point and decimal-exponent literals default to Float. Preserve the exact mathematical source numeral until its expected type or default type is selected. Default Float literals, including those with a matching Float annotation, use correctly rounded binary64 parsing with nearest/ties-to-even; ordinary `0.1` is allowed to round. Parsing consumes the complete numeral and is locale independent and backend independent.

**Finite literal overflow rounds to signed infinity**, consistently with runtime Float overflow. A nonzero literal that underflows to zero produces the correctly signed zero; an optional diagnostic warning may explain the loss. Underflow is not a language inconsistency or a mandatory error. Overflow diagnostics must not redefine this accepted value rule. Invalid lexical forms and a literal that cannot inhabit its selected Int type are compile-time errors.

An annotation, function parameter, or declared return position can supply an expected numeric type before literal typing. Retargeting a literal from its default category must be exact: an integer numeral expected as Float must be exactly representable; a decimal-point/exponent numeral expected as Int must be integral and in range. Negative floating zero cannot be contextually retargeted to Int because that loses its sign; an explicit Float-to-Int conversion may intentionally produce zero.

Examples using provisional Q01 spelling:

| Context | Meaning |
| --- | --- |
| Unannotated `0.1`, or Float-annotated `0.1` | Correctly rounded Float |
| Int-expected `1.0` / `1.5` | Int one / compile-time error |
| Float-expected integer numeral `9007199254740993` | Error: contextual conversion would be inexact |
| Float-expected integer numeral `9223372036854775808` | Valid, exactly representable Float; do not first reject it as default Int |
| Bare `1 + 1.0` | Type mismatch; one operand does not silently supply its type to its sibling |
| The same expression with an independently supplied Float expectation | Both literals can be Float because retargeting the integer one is exact |

This flexibility applies only to literals, not typed variables or arbitrary constant expressions. It does not introduce generic numeric overloading. Q11's explicit function boundaries and inferred locals/call results remain intact.

Support decimal, explicitly prefixed binary/octal/hex integer magnitudes, digit separators within valid digit runs, and decimal Float notation including exponents. Prefixes denote mathematical magnitude, not signed bit patterns; leading zeros must not imply octal. Exact prefix letters/case, separator character/placement, decimal-point requirements, exponent markers, leading-zero acceptance, and sign-token grammar are deferred to Q01. Hexadecimal Float literals and typed numeric suffixes are not added to v0.1.

A directly negated literal is range-checked as a signed mathematical value, permitting -9223372036854775808 in each supported base. Its positive magnitude is not a valid default Int. The exception does not extend to computed positive expressions. **Parenthesized literal syntax is now settled** (accepted 2026-09-20, see [syntax](syntax.md#q01-follow-up-details-accepted)): parentheses end the adjacency the exception requires, so `-(9223372036854775808)` is rejected because the parenthesized magnitude must inhabit Int before the negation applies. Negation of an already typed minimum Int faults. Minimum Int divided by -1 faults, but **minimum Int remainder -1 is zero**; the overflowing quotient need not be materialized. Integer division or remainder by zero faults. Any eventual absolute-value operation must also respect checked overflow at minimum Int.

## Explicit conversions and errors (S01, S02, S03)

Provide separate exact and explicitly rounded Int-to-Float operations. Exact conversion returns Result and fails with the semantic category *inexact* if the mathematical integer is not representable. Rounded conversion is total over Int, using nearest/ties-to-even; all Int values are within Float's finite magnitude range. Exactness is not the JavaScript safe-integer test: some larger integers are exactly representable. Minimum Int converts exactly; maximum Int rounds to positive 2^63.

Provide exact Float-to-Int conversion and explicitly truncating Float-to-Int conversion, both returning Result. Exact conversion requires a finite, integral value in `[-2^63, 2^63)`. Truncating conversion first truncates toward zero mathematically and then checks that result's range. Reject NaN and either infinity in both operations. Either floating zero converts to Int zero. Do not compare against an Int maximum first rounded to Float: that rounded value is the exclusive upper bound, not a valid Int.

Numeric conversion errors form a closed set of semantic categories: *non-finite*, *out of range*, and *inexact*. Exact Float-to-Int classification checks non-finiteness, then the original value's range, then integrality. Truncating conversion checks non-finiteness and the truncated result's range. Text syntax errors and foreign-kind mismatches belong to parsing/boundary errors, with explicit nesting or translation of numeric errors. Public variant names, payloads, operation names, and Result integration spelling await Q01/Q04/Q06. A predictable conversion failure remains an ordinary Result value, not an arithmetic compile-time error.

## Arithmetic faults and constant evaluation (S17)

Integer overflow and integer division/remainder by zero are source-located checked arithmetic faults, with identical behavior in every build mode. Ordinary arithmetic operators retain numeric result types. Explicit checked operations can represent expected arithmetic failure through Result; their public names, error payloads, and integration with Q04/Q07 remain unspecified. Runtime fault transport, presentation, and process exit contracts are not selected here.

Where constant evaluation is **semantically required**, an invalid arithmetic result is rejected at compile time using these same arithmetic rules. Define the required constant-expression contexts and permitted evaluation subset separately during specification completion; Q02 does not invent a constant-declaration syntax, execute arbitrary user functions at compile time, or make optimizer reachability analysis authoritative.

Ordinary code is distinct from a required constant-expression context. There is **no blanket requirement** to reject every faulty constant arithmetic subtree in a provably unreachable ordinary branch. An unexecuted operation causes no runtime arithmetic fault. Future reachability/constant-folding diagnostic policy can be refined without changing arithmetic semantics. Invalid literals and ordinary type errors still receive their own static checks. Float NaN/infinity/underflow results are valid values, and conversion Results containing errors are not invalid arithmetic. Constant-evaluator resource limits and diagnostic identifiers remain separate tool/specification details.

## Special values and numeric text (S07, S19, S20)

Provide named standard numeric constants and predicates for special Float values; defer exact names and syntax to Q01. These are **named values and APIs, not literal tokens**: no spelling of NaN or an infinity is part of the expression grammar, and a literal that overflows to a signed infinity does so as a value rather than by naming one. Use locale-independent base-10 Int text and shortest-round-trip finite Float text. Preserve negative zero and use canonical explicit special-value spellings, whose exact tokens remain to be chosen. Source-like integral Float text must retain a Float classification marker. Numeric interpolation follows these formatting semantics; interpolation syntax remains Q01, and its output is not implicitly JSON or SQL.

Runtime parsing consumes the entire input and returns typed parse/conversion failures. The default is strict canonical text with no surrounding whitespace or locale dependence; alternate formats require explicit opt-in. Exact accepted separator/base/special-value tokens and parsing API spelling must align with the future Q01 grammar. Parsing erroneous text remains a recoverable value even when that text is a source string literal.

NaN payloads, signaling bits, and exception flags are not observable language facilities in v0.1. Foreign codecs must not accidentally expose them as portable numeric guarantees. Total ordering, numeric hashing/map-key rules, bit-level Float APIs, and additional rounding modes are deferred. Signed zero remains observable through the accepted operations, despite primitive equality treating both zeros alike.

## JavaScript numeric boundaries (S12)

Foreign values must be validated before becoming Koda values, in every build mode. Declared checked adapters may support both Number and BigInt; actual foreign declaration syntax and private storage remain Q06/Q08.

| Boundary | Accepted requirement |
| --- | --- |
| BigInt to Int | Check exact signed 64-bit bounds; never truncate or wrap |
| Number to Int, default adapter | Require finite, integral input within `[-(2^53-1), 2^53-1]`; negative zero becomes integer zero |
| Koda Float to Int, deliberately requested | Use the exact/truncating conversion above; the conservative default foreign policy does not narrow Koda Int |
| Int to BigInt | Lossless |
| Int to Number | Explicit exact or rounded conversion as specified above |
| Number to Float | Validate kind and declared contract; binary64 special values are supported when the contract allows them |
| Arbitrary BigInt to Float | Declared exact or rounded adapter, with explicit out-of-Float-range policy; that adapter policy must be specified before exposing this wider-than-Int boundary |
| Other JS kinds | No accidental coercion of strings, booleans, or boxed objects |

Checks cannot reconstruct precision already lost by the producer. A Number-only representation without correct Int machinery is not a conforming implementation. Adapter error wrapping and the chosen v0.1 foreign API surface remain Q06.

## JSON (S13)

Use explicit schema codecs. The default interoperable Int numeric profile accepts/emits only the safe-integer interval and returns an error outside it. Opt-in schemas can use decimal strings consistently for an Int field, or lossless numeric tokens with a declared capable receiver. Never switch a field between number and string merely according to magnitude.

Parse incoming Int tokens from exact text, not Number followed by a range check. Default Int codecs accept integer-form tokens; integral fraction/exponent forms require an explicitly selected alternate codec. Finite Float output must round-trip under the specified binary64 reader. Standard numeric JSON rejects non-finite Float values; special values require an explicitly tagged schema, never silent null or untagged-string replacement. Koda-aware codecs preserve floating negative zero; arbitrary peers may not. Concrete codec APIs, tag formats, and integration/delivery scheduling remain unresolved under the boundary/toolchain proposals; these numeric safety requirements are accepted now.

## Future persistence contract (S14)

These semantics constrain later persistence adapters; **implementation is deferred until persistence** and Q09 remains unresolved. Adapters declare column/driver metadata and validate ranges and representations. Native signed 64-bit columns map losslessly to Int; narrower columns require checked writes. Unsigned values above Int's maximum require rejection or an explicitly declared separate domain. Preserve integer text/BigInt driver values exactly; never silently trust unsafe Number output.

Float adapters must state support for subnormals, signed zero, NaN/infinity, and storage/comparison behavior. Reject unsupported preservation requirements or require an explicitly lossy codec. Do not silently map database DECIMAL/NUMERIC to Float: use an explicit text/domain adapter or report unsupported mapping. SQL expression, aggregate, nullability, and round-trip contracts remain persistence work; Koda comparison rules must not be assumed identical to a database's rules. Entity identity/equality remains Q09 under Q11.

## Reserved and deferred (S11, S18)

Reserve `Decimal` for future exact decimal arithmetic, but it is **not usable in v0.1** and has no runtime semantics. The reservation mechanism (keyword, prelude/name restriction, diagnostic spelling) remains Q01; representation, precision, scale, literals, conversions, and arithmetic are deferred. Text transport of a database decimal does not implement Decimal.

Defer exponentiation, Float remainder, bitwise operations/shifts, unsigned arithmetic, transcendental functions, hexadecimal Float literals, typed numeric suffixes, advanced Float bit APIs, total ordering, numeric hashing, extra rounding modes, floating trap/flag controls, and Decimal arithmetic. No power behavior, including zero-to-zero or negative exponents, is selected. Backend representation/ABI remains Q08, not a numeric language rule.

See [future numeric conformance obligations](../../tests/numeric-conformance.md). Nothing in this document implements a compiler, runtime, serializer, or adapter.
