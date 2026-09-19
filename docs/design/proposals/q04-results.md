# Q04: Result obligations and failure policy

State: **AWAITING DECISION**. Selected option: **none**. Every refinement remains pending.
Depends on Q02/Q03; informs syntax, interop, tools, and concurrency.

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

## Recommendation, not acceptance

Recommend **B**, with an honest local proof boundary. It cannot prove business intent or eventual inspection of stored results.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Local handling | Warning: flexible; error: stronger; linear: most complex | Error on bare expressions and reachable paths that discard an unread local Result at overwrite/exit |
| Transfer | Passing/storing counts: tractable; transitive analysis: stronger; forbid storage: restrictive | Passing, returning, storing transfers local responsibility |
| Intentional ignoring | Underscore assignment: terse; discard function: visible; explicit match: verbose/auditable | Explicit match; no dedicated discard escape in v0.1; ignoring in both arms is intentionally allowed |
| Propagation | Match/return: small; explicit ?/try sugar: concise; implicit propagation: conflicts with brief | Match/return initially |
| I/O failures | Result-returning writes: recoverable; Unit/fatal print: easy; both: larger API | Checked output returns Result; existing Unit-print examples await revision only after approval |
| Fatal faults | General exceptions: new model; fatal diagnostic: small; Result for every defect: pervasive | Fatal invariant/arithmetic path, foreign throws converted at declared boundaries |

Before approval, cover unused bindings, only-one-branch use, overwrites, return/storage/argument transfer, and deliberate ignoring. If path analysis is too large, explicitly choose A rather than advertising B while counting name references.
