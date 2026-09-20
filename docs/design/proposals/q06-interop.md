# Q06: JavaScript/npm interoperability

State: **AWAITING DECISION**. Selected option: **none**. All boundary and installation subchoices remain pending.
Depends on Q02–Q05; supplies the external contract for Q08.

The accepted [Q11 decision](../../decisions/0007-q11-type-boundaries.md) fixes Unicode scalar-value strings and rejection of invalid/lone surrogates at foreign boundaries. Those requirements are no longer optional refinements; this proposal still awaits a decision on adapter behavior and error reporting. Q06 remains AWAITING DECISION.

[Q02 / ADR 0008](../../decisions/0008-q02-numeric-semantics.md) fixes [numeric validation and JSON profiles](../../spec/numbers.md): checked signed-64-bit BigInt input, conservative safe-integer Number-to-Int defaults, explicit exact/rounded exports, and schema-selected lossless JSON transport. Every option below must preserve these requirements in all builds. Foreign declaration syntax, codec APIs/tag layouts, wrapping errors, delivery scope, and the explicit overflow policy for a wider-than-Int BigInt-to-Float adapter remain Q06 work; no unchecked coercion option is available.

## Decision and why it matters

Choose how foreign signatures are declared, validated, loaded, and installed. A declaration cannot prove what arbitrary JavaScript will return or throw. npm access must not silently weaken compiler authority or immutable/null-safe guarantees.

## Alternatives

| Option | Policy | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Explicit foreign declarations; synchronous named ESM functions over primitives; checked wrappers | Small auditable boundary, precise failures | Excludes many real npm APIs, callbacks, objects, and async calls |
| B | Explicit declarations plus schema codecs, objects, and Promises | Much wider ecosystem utility | Needs concurrency, object ownership, recursive codecs, and rejection policy |
| C | Handwritten JavaScript adapters with declarative primitive schemas; compiler sees only adapters | Complex libraries can be wrapped externally without expanding core syntax | Adapter authors maintain trusted code; less direct npm ergonomics |

All retain strong Koda checking. Automatic trust in .d.ts or arbitrary any is not a viable substitute.

## Established languages

| Language | Approach |
| --- | --- |
| Rust | The ecosystem wasm-bindgen catch attribute converts thrown JS exceptions into Result for declared imports; this is a binding tool, not Rust grammar. [wasm-bindgen](https://wasm-bindgen.github.io/wasm-bindgen/reference/attributes/on-js-imports/catch.html) |
| Kotlin | Kotlin/JS uses external declarations and interop facilities; declarations describe foreign APIs. [JS interop](https://kotlinlang.org/docs/js-interop.html) |
| Swift | C/C++ interoperability uses imported modules and wrappers, illustrating an explicit foreign boundary rather than npm-native semantics. [Wrapping libraries](https://www.swift.org/documentation/articles/wrapping-c-cpp-library-in-swift.html) |
| TypeScript | .d.ts files describe API types and emit no runtime implementation or validators. [Declarations](https://www.typescriptlang.org/docs/handbook/2/type-declarations.html) |
| Go | syscall/js offers a low-level JS interface on the js/wasm target; it is not transparent Node source interoperability. [syscall/js](https://pkg.go.dev/syscall/js) |
| Python | ctypes binds native libraries through explicit function/value descriptions; incorrect foreign assumptions can bypass Python safety. [ctypes](https://docs.python.org/3/library/ctypes.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Small clear API, frustrating exclusions | Convenient ecosystem access, complex failures | Extra adapter layer to understand |
| AI-generated code | Narrow signatures reduce invented capabilities | More opportunities for wrong codecs/lifetimes | Adapter code needs separate review and tests |
| Compiler complexity | Moderate signature/check generation | High async/object/codec machinery | Small compiler, more external tooling |
| Runtime performance | Primitive checks and Result construction | Conversion/allocation and async overhead | Adapter-specific overhead, possibly optimized |
| Interoperability | Narrow by design | Broadest coverage | Broad libraries behind limited exported surfaces |
| Compatibility | Can add explicit supported categories later | Early codec/async ABI commitments | Adapter protocol becomes stable boundary |

## Recommendation, not acceptance

Recommend **A** for v0.1, with **C** as a documented later bridge if a motivating library cannot fit. Do not claim general npm compatibility.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Declaration format | foreign block in .ko: one language/parser work; TOML schema: simple/less expressive; handwritten adapters: more trust | Explicit .ko foreign block, separate declared JS result from generated Koda Result signature; final spelling returns to Q01 |
| Remaining value checks | Explicit codecs: safe/configuration; generated validators: convenient/compiler work; narrower boundary: less coverage | Q02 numeric and Q11 Unicode validation are mandatory in every build mode; settle remaining primitive/null/codec behavior |
| undefined | Always map to null: convenient/conflates; reject: strict; opt-in nullable conversion: explicit | Reject unless declared conversion to nullable; never collapse Unit and absence |
| Throws | Fatal: simple; declared Result wrapping: recoverable; arbitrary catch syntax: extra language | Call throws and invalid return values become ForeignError variants, including non-Error throws |
| Loading failure | Fatal startup: simple; explicit async load Result: flexible/new surface; lazy first-call load: surprising effects | Source-located fatal initialization diagnostic before main; call failures remain Results; import success cannot be assumed from type checking |
| Unsupported values | Accept raw objects: broad/unsafe; reject: narrow; codecs: larger system | Reject object/Promise/callback signatures in v0.1; define unexpected thenable/rejection cleanup when freezing runtime contract |
| npm ownership | Custom resolver: costly; companion npm lock: faithful/two files; canonical embedded npm lock: one authority/translation | Delegate a pinned npm transport, project its exact locked data from Q05 into disposable install inputs |
| Install effects | Scripts automatically: broad/risky; explicit opt-in: flexible; disabled subset: restrictive | Lifecycle scripts disabled initially; explicit install command, no install during checking |

npm ci requires its lock to agree with package metadata and does not rewrite that lock. Any Koda projection must preserve this consistency rather than regenerate dependency resolutions during a build. [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

Before approval, define success, wrong primitive kind, out-of-range number, null/undefined, thrown string, failed module evaluation, unexpected Promise, and stale dependency lock. No foreign adapter or installer is implemented here.
