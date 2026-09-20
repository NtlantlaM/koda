# Q04: Result obligations and failure policy

State: **ACCEPTED** via [ADR 0010](../../decisions/0010-q04-result-obligations.md). Selected option: **B**, with beginner-first diagnostics and optional AI assistance.
Depends on Q02/Q03; informs syntax, interop, tools, and concurrency.

[Q02 / ADR 0008](../../decisions/0008-q02-numeric-semantics.md) fixes fallible numeric conversions as Results with non-finite/out-of-range/inexact categories and fixes source-located checked arithmetic faults. Required constant evaluation rejects invalid arithmetic; ordinary unreachable branches have no blanket Q02 rejection rule. Public error names/payloads and fault integration remain open here and under Q07. These accepted constraints do not select this proposal's Result-use enforcement policy.

## Decision and why it matters

Choose what callers must do with Result, whether intentional discard is allowed, and what overwrite/storage/transfer means. Also distinguish recoverable standard-library failures from fatal defects. Explicit Result is accepted; enforcement strength is not.

## Alternatives

| Option | Policy | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Must-use warning with explicit discard convention | Easy adoption; simple checking | Warnings may be ignored |
| B | Errors for bare/unused/directly overwritten Results; handling or transfer required | Strong local feedback without ownership | Cannot prove end-to-end handling; path analysis needed |
| C | Affine/linear obligation tracked through ownership and control flow | Stronger consumption guarantees | Complex storage, aliasing, generic, and callback interactions |

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Result has must_use, normally a warning; ? explicitly propagates. This is not a linear proof of meaningful handling. [Result](https://doc.rust-lang.org/std/result/), [must_use](https://doc.rust-lang.org/reference/attributes/diagnostics.html) |
| Kotlin | Exceptions are unchecked; callers are not required to catch them. [Exceptions](https://kotlinlang.org/docs/exceptions.html) |
| Swift | throws/try makes throwing calls and propagation visible; catch handles failures. [Error handling](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/ErrorHandling.md) |
| TypeScript | Catch values can be unknown and require narrowing; thrown errors are not checked return obligations. [Catch variables](https://www.typescriptlang.org/tsconfig/useUnknownInCatchVariables.html) |
| Go | APIs commonly return a value and error for callers to inspect explicitly. [Errors in Go](https://go.dev/blog/error-handling-and-go) |
| Python | Runtime exceptions propagate until caught by try/except. [Exceptions](https://docs.python.org/3/tutorial/errors.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Less blocking, failures easy to miss | Teaches explicit handling | More difficult consumption rules |
| AI-generated code | Can compile with lost-error warnings | Actionable errors catch local loss | Strong constraints, harder repairs |
| Compiler complexity | Low | Moderate local control/data flow | High ownership/type-system work |
| Runtime performance | Result representation only | Usually static overhead only | Static tracking may erase, but constrains APIs |
| Interoperability | Easy to ignore adapter failures | Natural checked adapter boundary | Foreign callbacks complicate obligations |
| Compatibility | Later hard errors break builds | Combinators can be added explicitly | Obligation rules are deeply embedded |

## Accepted direction

Selected **B**, with an honest local proof boundary. Koda requires recoverable failures to be handled or explicitly transferred, but does not claim to prove business intent after a Result is stored or passed elsewhere.

The developer experience is a semantic requirement: Result diagnostics must explain the failure in plain language before introducing advanced terminology. A diagnostic should answer **what happened, where, why, and what the developer can do next**. Stable codes and structured context support editors and optional AI assistance.

The compiler remains authoritative. AI may explain a diagnostic, propose context-aware repairs, or help teach the underlying concept, but AI cannot suppress an error, redefine validity, or be required for compilation. Deterministic offline explanations such as `koda explain <code>` are part of the intended tooling contract; exact CLI spelling remains Q07.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Local handling | Warning: flexible; error: stronger; linear: most complex | Error on bare expressions and reachable paths that discard an unread local Result at overwrite/exit |
| Transfer | Passing/storing counts: tractable; transitive analysis: stronger; forbid storage: restrictive | Passing, returning, storing transfers local responsibility |
| Intentional ignoring | Underscore assignment: terse; discard function: visible; explicit match: verbose/auditable | Explicit match; no dedicated discard escape in v0.1; ignoring in both arms is intentionally allowed |
| Propagation | Match/return: small; explicit ?/try sugar: concise; implicit propagation: conflicts with brief | Match/return initially |
| I/O failures | Result-returning writes: recoverable; Unit/fatal print: easy; both: larger API | Checked output returns Result; existing Unit-print examples await revision only after approval |
| Remaining fault integration | Fatal diagnostics: small; recoverable nonnumeric defects: broader model; Result for expected failures: explicit | Respect accepted Q02 checked arithmetic faults and conversion Results; decide remaining invariant/foreign policy and integration without changing numeric semantics |

Before approval, cover unused bindings, only-one-branch use, overwrites, return/storage/argument transfer, and deliberate ignoring. If path analysis is too large, explicitly choose A rather than advertising B while counting name references.


## Beginner-first failure experience

Koda treats an unhandled recoverable failure as a teaching opportunity rather than exposing implementation jargon first.

A bare Result-returning call is rejected:

```koda
sendEmail(user)
```

The human diagnostic should explain that the operation can succeed or fail and that the program has not said what to do when it fails. It should show concrete choices such as matching the Result or returning/transferring it.

Diagnostic wording may improve without changing the stable diagnostic code. The first rendering should avoid requiring prior knowledge of terms such as affine values, must-use, monads, or unchecked exceptions.

## Accepted Result obligations

- A bare Result expression that is reachable is an error.
- A Result bound to a local must not be silently overwritten or abandoned on a reachable exit while still locally unhandled.
- Matching/inspecting the Result counts as local handling.
- Returning, passing, or storing a Result explicitly transfers the local responsibility; v0.1 does not attempt transitive whole-program proof of eventual business handling.
- Deliberate ignoring has no dedicated discard escape in v0.1. An explicit match may intentionally choose to do nothing after making both outcomes visible.
- Implicit error propagation is rejected. Initial v0.1 semantics use explicit match/return; concise propagation syntax remains a Q01 decision only if it preserves visible intent.
- Expected/recoverable failures use Result. Programmer/compiler invariant failures and accepted Q02 checked arithmetic faults are not automatically converted into Result.
- Exact I/O APIs remain library/tooling work, but recoverable I/O failure must not be silently erased.

## AI assistance contract

AI assistance is optional and layered on deterministic compiler diagnostics.

The compiler produces the stable code, source spans, explanation data, and safe-edit metadata first. AI may consume that structured diagnostic plus explicitly provided project context to:

- restate the error in beginner-friendly language;
- explain why Koda rejected the program;
- propose one or more context-aware repairs;
- explain tradeoffs between valid repairs;
- teach the relevant language concept.

AI must not:

- decide whether invalid code is valid;
- suppress compiler diagnostics;
- silently apply uncertain semantic changes;
- be required to compile, check, test, format, or understand standard diagnostics;
- transmit project/source context without an explicit AI configuration and future privacy contract.

Mechanically safe edits are compiler/tooling facts, not AI judgments. A future `koda fix --safe` may apply only edits classified as mechanically safe by deterministic tooling. Exact commands/configuration/provider/privacy behavior remain Q07/platform decisions.

## Diagnostic design principles

1. **Compiler authority:** the compiler knows whether the program satisfies Koda semantics.
2. **Beginner first:** explain the concrete problem before specialist terminology.
3. **Actionable:** every ordinary diagnostic should say what the developer can do next when a useful next step is known.
4. **Progressive disclosure:** concise rendering first; deterministic deeper explanation on request; optional AI explanation after that.
5. **Stable machine contract:** diagnostics carry stable codes and structured context suitable for editors, tests, and AI clients.
6. **No AI dependency:** correctness and baseline explanations work offline.
7. **No fake certainty:** when multiple repairs are semantically possible, tooling presents choices rather than silently selecting business intent.
