# Q08: JavaScript representations and emitted artifacts

State: **AWAITING DECISION**. Selected option: **none**. All representation details remain pending.
Depends on Q11/Q02–Q04 and the Q06 public boundary.

[Q02 / ADR 0008](../../decisions/0008-q02-numeric-semantics.md) fixes checked signed-64-bit Int, per-operation binary64 Float, numeric conversions, and observable faults independently of storage. Q08 selects private representations/helpers and ABI details only. Raw Number arithmetic is not a valid Int model; optimizations must preserve exact results, checks, signed zero, subnormals, and evaluation behavior. No portable NaN-payload/bit/hash/total-order API is implied.

## Decision and why it matters

Choose the observable runtime contract and private representation for records, enums, nullables, Unit, generics, numeric checks, modules, and source maps. Separate stable Koda semantics from internal JS object layouts so optimizations do not become breaking language changes.

## Alternatives

| Option | Representation family | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Private tagged objects for enums, ordinary immutable record values, erased generics, small helper runtime | Readable output, simple lowering, good source-map tracing | Some object allocations and runtime helper overhead |
| B | Compact tuples/numeric tags and aggressive unboxing/specialization | Potentially lower allocation/dispatch overhead | Less readable output, more lowering complexity, requires measurement |
| C | Public stable class/object ABI with exported constructors and runtime type metadata | Easy direct JS inspection and integration | Commits to layouts/prototypes; nominal runtime behavior leaks into interop |

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Default type layout gives limited guarantees; explicit representations establish stronger contracts. [Type layout](https://doc.rust-lang.org/reference/type-layout.html) |
| Kotlin | Kotlin/JS exposes specific export/interoperability rules rather than promising every internal declaration is a natural JS API. [JS exports](https://kotlinlang.org/docs/js-to-kotlin-interop.html) |
| Swift | ABI stability, module stability, and library evolution are distinct compatibility questions. [ABI discussion](https://www.swift.org/blog/abi-stability-and-more/) |
| TypeScript | Type annotations are erased; emitted JS does not perform their checks. Koda must add any checks its own semantics require. [Basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html) |
| Go | Source type/size rules do not equate a program's representation to JavaScript objects. [Specification](https://go.dev/ref/spec) |
| Python | CPython's C API exposes object/reference-management conventions, illustrating the cost of a public runtime ABI; this is implementation-specific. [C API](https://docs.python.org/3/c-api/intro.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Debuggable generated values | Opaque output, relies on debugger maps | Familiar class/object inspection |
| AI-generated code | Should target .ko; readable JS helps diagnosis | Harder to diagnose emitted internals | Risk of AI relying on exposed internal layouts |
| Compiler complexity | Lowest reasonable starting point | High optimization/representation work | Medium runtime metadata/ABI work |
| Runtime performance | Allocations/helpers, optimizable later | Potentially faster, not demonstrated yet | Class/metadata costs depend on JS engine |
| Interoperability | Explicit adapters only | Adapters hide compact layout | Direct access easy but tightly coupled |
| Compatibility | Private layout can evolve | Private layout can evolve, debugging harder | Layout changes become breaking ABI changes |

## Recommendation, not acceptance

Recommend **A**, keeping representations private and the public foreign contract explicit.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Enum tags | Strings: readable; integer IDs: compact; classes: reflective | Private qualified string tags plus positional payloads; include enum identity to avoid same-named variant collisions |
| Unit | undefined: compact/conversion hazards; singleton: distinct; no value: complicates generics | Private singleton Unit value; null represents absent nullable, so Unit? has two distinguishable states |
| Records | Plain private objects: simple; freeze: defense/cost; persistent structure library: updates/weight | Plain private immutable-by-contract values; Q03 boundary enforcement applies |
| Generic execution | Erasure: small; specialization: potentially fast/code growth; dictionaries: supports constraints | Erasure for the unconstrained Q11 subset |
| Arithmetic representation | Checked BigInt/helpers: clear; proven specialized representations: potentially faster/more proof work; inline checks: larger output | Shared helpers first, exact Q02 behavior; optimization requires conformance evidence |
| Output units | One module/source: traceable; single bundle: portable; preserve source extensions: custom loader | One .mjs per .ko with rewritten deterministic imports; .mjs unambiguously identifies Node ESM |
| Runtime dependency | Installed shared package: smaller; vendored build-local runtime: reproducible; inline everywhere: duplication | Version-matched build-local runtime artifact referenced by emitted modules |
| Maps and publishing artifacts | Maps only: private source; embedded sources: easy debugging/exposure; no maps: small/poor errors | Source maps without embedded source by default, retain project-relative source paths; explicit source embedding option later |

Node ESM requires explicit file extensions for relative imports, supporting the need for a deliberate rewrite contract. [Node ESM](https://nodejs.org/api/esm.html)

Before approval, distinguish Unit from null, enum variants from different types, aliasing, exactly-once evaluation, non-ASCII locations, runtime version mismatch, and output moves. No IR, runtime, or emitter is implemented.
