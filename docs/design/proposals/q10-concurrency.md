# Q10: Structured concurrency

State: **AWAITING DECISION**. Selected option: **none**. All task APIs and syntax remain pending.
Depends on Q03/Q04/Q06; discuss before Q09. Proposed implementation remains post-v0.1.

## Decision and why it matters

Choose scope lifetime, failure aggregation, Result interaction, cancellation, resource cleanup, and the first async surface. A scope must own and join its children, but that principle does not decide whether one error cancels siblings or how callers receive several failures.

## Alternatives

| Option | Structured policy | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Fail-fast scope on explicit task failure; cancel siblings and join before return | Bounds wasted work; natural request lifetime | Must preserve secondary errors and distinguish Err values from task failure |
| B | Collect-all scope; join every child and return all outcomes | Predictable independent batch results | Failed work does not stop unnecessary siblings automatically |
| C | Lexically declared child bindings with explicit awaits; scope exit always joins/cancels by documented exit kind | Small fixed-fanout model, visible control | Dynamic fanout limited; missed awaits still need defined cleanup |

All are structured. Detached tasks are outside the accepted direction, not an alternative silently introduced here.

## Established languages

| Language | Approach |
| --- | --- |
| Rust | std::thread::scope joins scoped threads; Rust async scheduling is a separate runtime concern, not automatically equivalent. [Scoped threads](https://doc.rust-lang.org/std/thread/fn.scope.html) |
| Kotlin | Coroutine scopes tie child lifetimes together; supervision changes failure propagation. [Coroutines](https://kotlinlang.org/docs/coroutines-basics.html), [failure handling](https://kotlinlang.org/docs/exception-handling.html) |
| Swift | Task groups/async-let structure child work; cancellation is cooperative. It also supports unstructured tasks, which Koda need not adopt. [Concurrency](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/Concurrency.md) |
| TypeScript | JavaScript Promise.all coordinates fulfillment/rejection but does not itself cancel sibling operations. This follows its specified algorithms, not a structured-concurrency guarantee. [Promise.all](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.all) |
| Go | The x/sync errgroup library combines waiting, first-error reporting, and context cancellation; goroutines themselves do not imply scoped lifetimes. [errgroup](https://pkg.go.dev/golang.org/x/sync/errgroup) |
| Python | asyncio.TaskGroup joins tasks, cancels siblings on most failures, and groups exceptions; cancellation must cooperate. [Task groups](https://docs.python.org/3/library/asyncio-task.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Useful request default, cancellation to learn | Straightforward batch results | Lexical ownership clear, less dynamic |
| AI-generated code | Scope boundaries help; Err/failure confusion possible | Easy to retain all outcomes | Visible awaits, easier fixed examples |
| Compiler complexity | Async lowering plus scope/failure runtime | Async lowering plus aggregate results | Smaller surface, still needs cleanup rules |
| Runtime performance | Can stop wasted cooperative work | Runs all tasks, higher resource use | Similar tasks, possible overly sequential awaits |
| Interoperability | Foreign calls need cancellation adapters | Uncancellable operations fit, delay exit | Foreign lifetimes still constrain joining |
| Compatibility | Failure ordering/cancellation becomes a contract | Switching to fail-fast changes effects | Later dynamic groups can be additive |

## Recommendation, not acceptance

Recommend **A** as the default eventual task-group policy, with an explicit collect-all library operation later. None of this is approved for v0.1.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Result interaction | Every Err automatically fails task: terse/implicit; only explicit failure signals: clear; tasks always return outcomes: collect-all | Ordinary Err stays a value; an explicit scope failure/adapter operation promotes it to task failure |
| Cancellation | Cooperative: portable; preemptive: responsive/unsafe cleanup; ignored until join: weak | Cooperative tokens/checkpoints and cancellable foreign adapters |
| Early scope exit | Cancel then join: structured; wait without cancel: simple; abandon: violates direction | Error/cancellation exit cancels and joins; normal exit joins |
| Multiple failures | First only: simple/lossy; ordered aggregate: informative; race-first primary plus others: nondeterministic primary | Preserve all observed failures, order report by child creation index; cancellation-generated outcomes distinguished from independent failures |
| Cleanup | Language defer: convenient/new grammar; scoped resource library: smaller; manual cleanup: fragile | Explicit scoped cleanup contract, join cleanup before scope exit; define cleanup-error aggregation before API freeze |
| Execution | Event loop I/O: JS fit; worker parallelism: CPU use; both: complex | Cooperative I/O first; CPU parallelism later |
| Syntax | async/await + scopes: familiar; library-only combinators: small grammar; async-let bindings: fixed fanout | Evaluate async/await plus an explicit scope library; exact keywords remain undecided |

A non-cooperative/blocking foreign call can delay termination indefinitely; structured lifetime is not a hard real-time cancellation guarantee. Decide resource deadlines and unresponsive tasks before implementation. The existing experimental example does not resolve any of these choices.
