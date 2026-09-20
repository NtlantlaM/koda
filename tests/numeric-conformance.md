# Future numeric conformance obligations

Status: required future coverage for accepted [Q02 / ADR 0008](../docs/decisions/0008-q02-numeric-semantics.md) and [numeric semantics](../docs/spec/numbers.md). This is a documentation-only fixture inventory, not executable tests. Limit names, arrows, operation labels, and example syntax are descriptive until Q01 fixes spelling. Run applicable cases on every backend and build mode; include constant evaluation where required and runtime evaluation through inputs that cannot be folded.

| Area | Witness | Required outcome |
| --- | --- | --- |
| Int range | Both signed 64-bit endpoints; default integer literals immediately outside | Endpoints accepted; out-of-range literals rejected |
| Minimum formation | Direct negative minimum in every supported base; typed minimum negation | Literal accepted; typed negation faults with source location |
| Checked operations | Maximum + 1; minimum - 1; overflowing multiplication | Checked faults, never wrapping |
| Optimization | `(maximum + 1) - 1` when executed | Fault preserved; no reassociation into success |
| Division signs | 7 / 3, -7 / 3, 7 / -3, -7 / -3 | 2, -2, -2, 2 |
| Remainder signs | 7 % 3, -7 % 3, 7 % -3, -7 % -3 | 1, -1, 1, -1 |
| Exceptional integer operands | Minimum / -1; minimum % -1; division/remainder by zero | Fault; zero; fault respectively |
| Literal defaults | Integer token; decimal-point token; exponent token | Int; Float; Float |
| Default Float rounding | `0.1`, with and without Float expectation | Same correctly rounded binary64 value |
| Ties-to-even parsing | Exact decimal midpoint 1.00000000000000011102230246251565404236316680908203125 | Float 1.0; neighbors on either side round appropriately |
| Literal overflow | Positive/negative finite numeral of magnitude `1.0e400` | Positive/negative infinity, not mandatory literal error |
| Literal underflow | Positive/negative nonzero numeral of magnitude `1.0e-400` | Signed zero; warning permitted, value unchanged |
| Context before default range | Integer numeral 9223372036854775808 expected as Float | Exactly representable Float accepted |
| Exact contextual retarget | Int-expected 1.0 / 1.5; Float-expected integer 9007199254740993 | One / error; error respectively |
| Contextual negative zero | Negative Float-zero literal expected as Int | Reject sign-losing contextual retargeting |
| Inference boundaries | Bare `1 + 1.0`; independently Float-expected expression | Type error; accepted exact retargeting respectively |
| Typed values | Int and Float operands in arithmetic, equality, ordering | Type error without explicit conversion, regardless of magnitudes |
| Exact Int-to-Float | 2^53, 2^53+1, minimum Int, maximum Int | Success, inexact error, success, inexact error |
| Rounded Int-to-Float | 2^53+1 and maximum Int | 2^53 and 2^63, nearest/ties-to-even |
| Float-to-Int bounds | Float -2^63 and +2^63 | Minimum Int accepted; upper boundary out-of-range |
| Float-to-Int fractions | Exact and truncating conversion of -1.75 | Inexact error and -1 respectively |
| Conversion categories | NaN/infinity; finite out-of-range; in-range fractional | Non-finite; out-of-range; inexact for exact conversion |
| Explicit zero conversion | Either Float zero to Int | Int zero |
| Float equality/ordering | NaN with itself/finite values/infinities; both zeros | NaN equality false, inequality true, all ordering false; zeros equal and neither less |
| Float division | 1.0 / +0.0, 1.0 / -0.0, 0.0 / 0.0, infinity / infinity | Positive infinity, negative infinity, NaN, NaN |
| Float range | Largest finite overflow; smallest normal divided by two; smallest positive subnormal divided by two | Infinity; nonzero subnormal; positive zero by ties-to-even |
| Backend reproducibility | Fixtures sensitive to FMA/reassociation/excess precision; effectful operands | Per-operation binary64 result and exactly-once evaluation preserved |
| Required constant evaluation | Integer zero division/overflow in a semantically required constant context | Compile-time rejection with source location |
| Ordinary unreachable branch | Faulty arithmetic in an unexecuted ordinary branch | No runtime fault; no Q02 blanket compile-time rejection obligation; separate future diagnostic policy |
| Valid constant results | Float NaN/infinity/underflow; failed fallible conversion | Valid Float/Result values, not invalid arithmetic |
| Foreign Number-to-Int | Safe endpoints, fractions, NaN/infinities, unsafe integral Number, -0 | Safe endpoints accepted; invalid categories rejected; -0 becomes zero |
| Foreign BigInt | Int endpoints and values just outside | Exact endpoints accepted; out-of-range rejected without wrapping |
| Foreign kind and export | Boolean/string/boxed number; Int-to-Number exact versus rounded | Kind mismatch; explicit S01 behavior |
| JSON Int | Safe default endpoint; maximum Int in default versus declared lossless profile | Success; default error versus exact round trip; no magnitude-based field-type switch |
| JSON token handling | Exact large integer text; fractional/exponent form for default Int codec | No premature Number rounding; non-integer-form tokens rejected by default |
| JSON Float | Finite round trips, negative zero, NaN/infinities | Binary64 round trip and Koda-aware zero-sign preservation; non-finite default error or explicit tagged schema |
| Canonical text | Int bounds, finite Float, integral Float, negative zero, specials | Locale-independent canonical round trips; source-like Float classification preserved |
| Text parsing | Trailing junk/whitespace, locale forms, malformed input | Strict default whole-input failure as a typed value; alternate formats opt-in |
| Deferred features | Decimal use, power, Float remainder, bit/payload/hash facilities | No implied v0.1 runtime semantics; unsupported constructs diagnosed once Q01 fixes syntax |

Additional parser fixtures must cover every approved base/separator/exponent spelling once Q01 is resolved. Error variant spelling, source-span schema, and exit codes await Q04/Q06/Q07; test the accepted semantic categories now in this plan, not invented API names. Required constant contexts, evaluator limits, and reachability diagnostics need distinct fixture groups once specified. The wider foreign BigInt-to-Float boundary needs an explicit overflow contract before fixtures can establish an API promise.

## Deferred persistence obligations

When persistence is introduced, test exact signed-64-bit column round trips, narrower-column checked writes, unsigned overflow, exact text/BigInt driver inputs, unsafe Number rejection, and explicit DECIMAL/NUMERIC domain transport without silent Float conversion. Test adapter-declared subnormal, signed-zero, NaN/infinity preservation and database comparison differences. Unsupported preservation must fail or require an explicitly lossy codec. These are accepted future S14 obligations, not acceptance of Q09 or a v0.1 persistence implementation.
