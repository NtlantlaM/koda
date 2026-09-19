# Feature status register

All maturity statuses describe the initial design baseline. Nothing is implemented. ACCEPTED applies only to user-supplied principles; concrete semantics and proposed delivery scope remain AWAITING DECISION. The decision-state column applies to those details, not to reopening the user's explicit requirements. See [ordered proposals](open-questions.md) and the [review](specification-review.md).

- **ACCEPTED**: user-supplied design principle. Concrete detail and delivery scope require separate decisions.
- **EXPERIMENTAL**: a candidate design requiring evaluation; syntax and semantics may change or be removed.
- **LATER**: deliberately outside v0.1; no compatibility commitment.
- **REJECTED**: excluded from the current language direction. Reconsideration requires an ADR.

| Feature | Maturity | Delivery / boundary | Decision state for details/scope |
| --- | --- | --- | --- |
| Standalone language, `.ko` files | ACCEPTED | v0.1; ADR 0001 | AWAITING DECISION |
| Optional AI; compiler owns correctness | ACCEPTED | All stages; no AI dependency | AWAITING DECISION |
| TypeScript compiler, JavaScript/Node.js backend | ACCEPTED | v0.1; ADR 0001 | AWAITING DECISION |
| Strong static typing with local inference | ACCEPTED | v0.1; type rules must be frozen | AWAITING DECISION |
| Immutable bindings by default, explicit `mut` | ACCEPTED | v0.1; aliasing details in Q03 | AWAITING DECISION |
| Nullable `T?`, no implicit nullability | ACCEPTED | v0.1 | AWAITING DECISION |
| Explicit `Result<T, E>` for recoverable failure | ACCEPTED | v0.1; no implicit error propagation | AWAITING DECISION |
| Exhaustive pattern matching; associated-data enums | ACCEPTED | v0.1 | AWAITING DECISION |
| Nominal application records declared with `type` | EXPERIMENTAL | v0.1 | AWAITING DECISION |
| Functions, lexical scopes, modules, explicit exports | EXPERIMENTAL | v0.1 | AWAITING DECISION |
| Generic records, enums, and functions | EXPERIMENTAL | v0.1; no higher-kinded types | AWAITING DECISION |
| Numeric and string primitive model | EXPERIMENTAL | Freeze numbers in Q02 and strings in Q11 before compiler work | AWAITING DECISION |
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
