# Feature status register

Maturity and decision state describe the language, not the implementation. A
compiler implementation now reaches [Slice 3B](../implementation/slice-3b.md);
a feature being implemented there does not change its row, and a row being
ACCEPTED does not mean it is implemented. ACCEPTED covers user-supplied principles and expressly approved decisions, including [Q11 / ADR 0007](../decisions/0007-q11-type-boundaries.md), [Q02 / ADR 0008](../decisions/0008-q02-numeric-semantics.md), and [Q03 / ADR 0009](../decisions/0009-q03-mutation-and-aliasing.md). Unresolved concrete semantics and delivery scope remain AWAITING DECISION. Approved deferrals have LATER maturity and an ACCEPTED decision state; their eventual designs are not selected. See [ordered proposals](open-questions.md) and the [review](specification-review.md).

- **ACCEPTED**: user-supplied principle or expressly approved design decision. Details outside that approval require separate decisions.
- **EXPERIMENTAL**: a candidate design requiring evaluation; syntax and semantics may change or be removed.
- **LATER**: deliberately outside v0.1; no compatibility commitment.
- **REJECTED**: excluded from the current language direction. Reconsideration requires an ADR.

| Feature | Maturity | Delivery / boundary | Decision state for details/scope |
| --- | --- | --- | --- |
| Standalone language, `.ko` files | ACCEPTED | v0.1; ADR 0001 | AWAITING DECISION |
| Optional AI; compiler owns correctness | ACCEPTED | All stages; no AI dependency | AWAITING DECISION |
| TypeScript compiler, JavaScript/Node.js backend | ACCEPTED | v0.1; ADR 0001 | AWAITING DECISION |
| Explicit function parameter/return types; inferred locals and call results | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Immutable bindings by default; `mut` permits rebinding ordinary values | ACCEPTED | v0.1; Q03 / ADR 0009 | ACCEPTED |
| Nullable `T?`; reject written `T??`; flatten nullable generic substitution | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Null refinement via match and explicit `x != null` / `x == null` checks on immutable locals and parameters; lexical lifetime; left-to-right `&&` composition | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Nullable compared with `null` as an absence test, not derived equality | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Early-return narrowing; refinement via `||`, negation, or an intermediate Bool | LATER | Explicit ADR 0007 deferrals | ACCEPTED deferral |
| Alias-aware mutable smart casts | LATER | Not provided in v0.1; Q11 | ACCEPTED deferral |
| Explicit `Result<T, E>` for recoverable failure | ACCEPTED | ADR 0010; values, construction and matching implemented in Slice 2B | ACCEPTED |
| Prelude payload names `Ok(value: T)` / `Err(error: E)`; unqualified positional constructors | ACCEPTED | ADR 0010 follow-up, 2026-09-21 | ACCEPTED |
| Contextual Result construction, including through one outer nullable wrapper | ACCEPTED | Slice 2B; no general inference | ACCEPTED |
| Result must-handle obligation enforcement | ACCEPTED | ADR 0010; direct bindings in Slice 2C; structural responsibility in Slice 3B | ACCEPTED |
| Match discharge requires visible `Ok` and `Err` arms; wildcards do not discharge | ACCEPTED | ADR 0010 follow-up, 2026-09-21 | ACCEPTED |
| Result parameters begin outstanding; binding transfers; overwrite rejected | ACCEPTED | ADR 0010 follow-up, 2026-09-21 | ACCEPTED |
| Must-handle tracking through record fields and enum payloads | ACCEPTED | ADR 0010 follow-up; implemented in Slice 3B with receiver renewal and conditional presence | ACCEPTED |
| Exhaustive pattern matching; associated-data enums | ACCEPTED | v0.1 | AWAITING DECISION |
| Nominal identity for Koda-defined types | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Functions, lexical scopes, modules, explicit exports | EXPERIMENTAL | v0.1 | AWAITING DECISION |
| Small invariant user-defined generics | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Generic record/enum declarations and concrete type applications | ACCEPTED | Slice 2A; declaration-local parameters, exact arity, substitution, nullable flattening, conservative recursion rejection | ACCEPTED |
| Generic value construction, explicit and contextual | ACCEPTED | Slice 3A; written arguments authoritative, otherwise taken from an expected type | ACCEPTED |
| Contextual construction looks through exactly one outer nullable wrapper, for every generic type | ACCEPTED | ADR 0007 follow-up, 2026-09-21; generalizes the Slice 2B Result rule | ACCEPTED |
| Generic argument inference from field or payload values | REJECTED | Slice 3A; construction without a complete expected type is rejected, never completed | ACCEPTED |
| Generic function/call syntax | ACCEPTED | Implemented in Slice 4A: explicit declarations and explicit calls | ACCEPTED |
| Explicit type arguments required at every generic call | ACCEPTED | Slice 4A; omission is an error, never inference | ACCEPTED |
| Generic body checked once under abstract type parameters | ACCEPTED | Slice 4A; no monomorphisation, full erasure | ACCEPTED |
| Conservative opaque responsibility for an unconstrained type parameter | ACCEPTED | ADR 0010 follow-up, 2026-09-22; `fn ignore<T>(x: T) -> Unit {}` rejected at its declaration | ACCEPTED |
| Generic-call type-argument inference | LATER | Outside Slice 4A; explicit arguments are the accepted v0.1 surface | AWAITING DECISION |
| Variance and advanced generic constraints | LATER | Deferred by Q11 | ACCEPTED deferral |
| Checked signed-64-bit Int; binary64 Float; same semantics on every backend/build mode | ACCEPTED | v0.1; [Q02 semantics](../spec/numbers.md) | ACCEPTED |
| Exact contextual literal typing; explicit typed numeric conversions and same-type comparisons | ACCEPTED | v0.1; Q02; spelling remains Q01 | ACCEPTED |
| IEEE Float special values/rounding; source-located checked Int faults | ACCEPTED | v0.1; Q02; required constant evaluation distinct from unreachable code | ACCEPTED |
| Numeric text, foreign validation, and explicit JSON numeric profiles | ACCEPTED | Q02 semantics; API/integration scope remains Q01/Q06 | ACCEPTED semantics |
| Numeric persistence mapping requirements | ACCEPTED | Q02 S14; implementation deferred until persistence; Q09 unresolved | ACCEPTED semantics |
| Decimal reservation; no usable v0.1 Decimal | ACCEPTED | Q02; reservation mechanism Q01 | ACCEPTED |
| Decimal semantics; exponentiation; Float remainder; bitwise/unsigned operations; transcendental functions; hex Float/suffix forms | LATER | Explicit Q02 deferrals | ACCEPTED deferral |
| Float bit/NaN payload APIs, total ordering, numeric hashing, extra rounding modes and trap/flag controls | LATER | Explicit Q02 deferrals | ACCEPTED deferral |
| Primitive equality; no exposed reference/object identity | ACCEPTED | v0.1; Q11 and accepted Q02 numeric comparison rules | ACCEPTED scope |
| Derived equality for user-defined value types | LATER | Deferred by Q11 | ACCEPTED deferral |
| Entity identity/equality | LATER | Deferred by Q11; persistence semantics remain Q09 | ACCEPTED deferral; Q09 AWAITING DECISION |
| Unicode scalar-value strings; exact non-normalizing equality | ACCEPTED | Q11 / ADR 0007 | ACCEPTED |
| Reject invalid/lone surrogates at foreign boundaries | ACCEPTED | Q11; error/adapter contract remains Q06 | ACCEPTED requirement |
| String interpolation and multiline strings | ACCEPTED | ADR 0011 surface accepted; remaining layout/conversion details separate | ACCEPTED |
| Scalar-value `String.length`, `get`, `startsWith`, `endsWith`, `contains` | ACCEPTED | Slice 6B; read-only, scalar-counted, `get` returns `String?` | ACCEPTED |
| String slicing, substrings, splitting, case conversion, trimming, ordering | LATER | Still deferred by Q11 | ACCEPTED deferral |
| Reject local/parameter shadowing and same-scope duplicates | ACCEPTED | Q11 / ADR 0007 | ACCEPTED |
| Ordinary function recursion | ACCEPTED | Q11 / ADR 0007 | ACCEPTED |
| Recursive user-defined data types, non-bearing and inhabitable | ACCEPTED | Slice 6C; cycle must be able to stop and carry no responsibility | ACCEPTED |
| Responsibility-bearing or generic recursive data | LATER | Rejected, not approximated; generic follows from Model B | AWAITING DECISION |
| Concrete syntax and operator precedence in syntax spec | ACCEPTED | ADR 0011 and its follow-ups; implementation is staged | ACCEPTED |
| Traits and composition over inheritance | ACCEPTED | Direction; trait syntax/implementation LATER | AWAITING DECISION |
| Entity distinct from ordinary application data | ACCEPTED | Direction; ADR 0003 | AWAITING DECISION |
| Entity schema, queries, transactions, adapter APIs | EXPERIMENTAL | Not in v0.1; design sketches only | AWAITING DECISION |
| Explicit database writes such as `User.create { ... }` | ACCEPTED | Constraint on future persistence | AWAITING DECISION |
| Structured concurrency | ACCEPTED | Direction; implementation LATER | AWAITING DECISION |
| Task scopes, cancellation, async surface syntax | EXPERIMENTAL | Not in v0.1 | AWAITING DECISION |
| One CLI, formatter, test runner, package manager | ACCEPTED | Minimal local tools in v0.1; registry LATER | AWAITING DECISION |
| Explicit typed JavaScript/npm boundary | ACCEPTED | Narrow v0.1 subset; Q06 | AWAITING DECISION |
| Foreign declaration spelling and codecs | EXPERIMENTAL | Freeze v0.1 subset in Q06 | AWAITING DECISION |
| Stable codes and structured diagnostics | EXPERIMENTAL | v0.1; ADR 0004 | AWAITING DECISION |
| Formatter-owned canonical style | ACCEPTED | v0.1 after syntax freeze | AWAITING DECISION |
| Immutable `List<T>`, literals, `get`/`length`/`isEmpty`, `for` iteration | ACCEPTED | Slice 5; prelude type, no indexing syntax, no producers | ACCEPTED |
| Out-of-range `get` returns `T?` | ACCEPTED | Slice 5; absence, not a failed operation | ACCEPTED |
| `for`/`in` reserved words | ACCEPTED | Slice 5; intentional pre-1.0 source compatibility change | ACCEPTED |
| Collective list responsibility; R1 normal completion, R2 read renews, R3 early return | ACCEPTED | ADR 0010 follow-up, 2026-09-22 | ACCEPTED |
| Intrinsic list operations may know what user generics cannot | **PROVISIONAL** | Slice 5; must be revisited before a List stdlib, map/filter/reduce or user generic collection abstractions | AWAITING DECISION |
| Persistent `List.append`, returning a new list | ACCEPTED | Slice 6A; original never changed, no mutating operation exists | ACCEPTED |
| `prepend`, `concat` and other list producers | LATER | Deferred from Slice 6A | AWAITING DECISION |
| `break` / `continue` | LATER | Deferred; they create partial-iteration responsibility edges | AWAITING DECISION |
| Indexing syntax `items[i]` | LATER | Deferred from Slice 5 | AWAITING DECISION |
| Maps, sets, comprehensions, map/filter/reduce, closures | LATER | Add only with motivating cases; transformations need generic-effect design first | AWAITING DECISION |
| Trait implementation, async runtime, database adapters | LATER | After v0.1 | AWAITING DECISION |
| Registry publishing, dependency lifecycle scripts | LATER | Security and governance policy required | AWAITING DECISION |
| Browser/native/Wasm targets, LSP, incremental compilation | LATER | Architecture should allow them | AWAITING DECISION |
| Classes and deep implementation inheritance | REJECTED | Prefer data plus functions/composition | AWAITING DECISION |
| Implicit database writes or schema changes | REJECTED | No hidden persistence effects | AWAITING DECISION |
| Framework routes, UI components, deployment grammar | REJECTED | Libraries/tooling own platform concepts | AWAITING DECISION |
| AI-required builds or AI overriding type errors | REJECTED | Deterministic compiler authority | AWAITING DECISION |
| TypeScript syntax passthrough, implicit `any` | REJECTED | Independent language and checked boundaries | AWAITING DECISION |
| Implicit coercions and implicit Result unwrapping | REJECTED | Make conversions and failure handling visible | AWAITING DECISION |
| Macros, operator overloading, decorators in v0.1 | REJECTED | Insufficient need for initial complexity | AWAITING DECISION |

Deferred accepted directions are intentionally not v0.1 promises. See the roadmap for the exact release boundary.

### Accepted Slice 3B scope

Structural Result responsibility with receiver renewal is ACCEPTED by explicit
human authorization. Implementation is tracked in [Slice 3B](../implementation/slice-3b.md);
all three stages must validate before the historical container gap is closed.
Ownership, moves, global provenance, effects and Q08 changes remain excluded.
