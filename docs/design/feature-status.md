# Feature status register

Maturity and decision state describe the language, not the implementation. A
first executable compiler slice exists ([slice 0](../implementation/slice-0.md));
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
| Null refinement via match and explicit checks on stable immutable locals | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Alias-aware mutable smart casts | LATER | Not provided in v0.1; Q11 | ACCEPTED deferral |
| Explicit `Result<T, E>` for recoverable failure | ACCEPTED | v0.1; no implicit error propagation | AWAITING DECISION |
| Exhaustive pattern matching; associated-data enums | ACCEPTED | v0.1 | AWAITING DECISION |
| Nominal identity for Koda-defined types | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
| Functions, lexical scopes, modules, explicit exports | EXPERIMENTAL | v0.1 | AWAITING DECISION |
| Small invariant user-defined generics | ACCEPTED | v0.1; Q11 / ADR 0007 | ACCEPTED |
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
| String interpolation and multiline strings | ACCEPTED | Supported; spelling/layout/conversion details remain open | ACCEPTED features; Q01 AWAITING DECISION |
| Direct string indexing and length semantics | LATER | Deferred by Q11 | ACCEPTED deferral |
| Reject local/parameter shadowing and same-scope duplicates | ACCEPTED | Q11 / ADR 0007 | ACCEPTED |
| Ordinary function recursion | ACCEPTED | Q11 / ADR 0007 | ACCEPTED |
| Recursive user-defined data types | LATER | Deferred by Q11 | ACCEPTED deferral |
| Concrete syntax and operator precedence in syntax spec | EXPERIMENTAL | Freeze in Q01 before parser work | AWAITING DECISION |
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
| Collection library, iteration, closures | LATER | Add only with motivating cases | AWAITING DECISION |
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
