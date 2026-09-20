# Diagnostics and error system

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** excellent diagnostics as a user principle. Codes, schema, rendering, severity policy, and exit contracts are **EXPERIMENTAL / AWAITING DECISION** under Q07. Codes below are candidates, not an already frozen registry.

The same compiler diagnostic model serves terminals, editors, tests, and optional AI clients. Human readability and machine structure are equally important. An AI suggestion cannot suppress a compiler error or change the rules of correctness.

## Required diagnostic model

Each diagnostic has a stable `code`, `severity` (`error`, `warning`, or `info`), concise `message`, primary source span, zero or more labeled secondary spans, explanatory notes, and optional suggested edits. Machine output includes a `schemaVersion`. Source spans identify a project-relative file and a half-open UTF-8 byte interval. Renderers compute one-based line/column positions for humans; editor adapters translate offsets explicitly.

Suggested edits contain replacement text and exact spans. They are never applied during ordinary checking. An applicability field distinguishes mechanically safe edits from changes requiring human judgment. JSON output must not mix terminal progress text into its stream. Diagnostic sorting is deterministic by file, position, severity, and code.

## Initial code families

| Code | Condition | Diagnostic focus |
| --- | --- | --- |
| KODA-P0001 | Unexpected token | What was expected and where parsing can resume |
| KODA-N0001 | Unresolved name | Scope and nearby plausible declarations |
| KODA-T0001 | Type mismatch | Expected and actual types plus their origin |
| KODA-T0002 | Unsafe nullable access | The nullable declaration and a match example |
| KODA-T0003 | Non-exhaustive match | Concrete missing variants |
| KODA-T0004 | Reassignment to immutable binding | Declaration span and explicit `mut` option |
| KODA-T0005 | Discarded Result expression | Handle, return, or bind the result |
| KODA-M0001 | Module resolution failure | Import path and resolution policy |
| KODA-F0001 | Foreign boundary failure | Binding and failed conversion |
| KODA-U0001 | Unsupported feature | Feature status and supported subset |
| KODA-I0001 | Compiler internal failure | Clear bug-report guidance, never blame source |

Codes remain stable when wording improves; removed codes are not reassigned to unrelated errors. Runtime failures and static errors must be distinguishable in the eventual output schema.

## Human rendering example

```text
error[KODA-T0004]: cannot assign to immutable binding 'count'
  --> src/main.ko:3:5
3 |     count = count + 1
  |     ^^^^^ assignment requires a mutable binding
note: 'count' was declared with 'let' at src/main.ko:2:5
help: use 'mut count = 0' if reassignment is intentional
```

Recovery should collect independent errors without flooding the user with cascades. Use explicit error nodes/types internally, suppress dependent diagnostics, and cap output with a count of omitted diagnostics. Never emit runnable output when compilation has errors. Expected source errors are diagnostics, not TypeScript exceptions.

## Verification requirements

Future tests assert codes, severity, spans, notes, deterministic ordering, UTF-8 position handling, and valid schema output. Human rendering uses focused snapshots. Test that malformed input does not crash and suggested edits affect only their declared spans. Fatal compiler errors must result in a failed command, even if some earlier phases succeeded.

## Accepted numeric diagnostic obligations

[Q02 / ADR 0008](../decisions/0008-q02-numeric-semantics.md) requires source-located checked integer overflow and division/remainder-by-zero faults. In semantically required constant evaluation, invalid arithmetic is a compile-time error. Ordinary unreachable code is a separate policy: there is no blanket Q02 requirement to reject every invalid arithmetic subtree in an unexecuted ordinary branch. Invalid literals retain static validation; predictable conversion errors remain Result values.

Float overflow to infinity, NaN results, and gradual underflow to signed zero are valid numeric outcomes, including literal rounding. A nonzero literal rounding to zero may receive an optional warning. Q07 still owns codes, rendering, warning configuration, evaluator resource-limit reporting, and exit contracts; these details must not redefine accepted numeric values. See [future conformance obligations](../../tests/numeric-conformance.md).


## Accepted beginner-first and AI-assistance principles

[Q04 / ADR 0010](../decisions/0010-q04-result-obligations.md) requires ordinary diagnostics, especially recoverable-failure diagnostics, to answer in plain language: what happened, where, why Koda cares, and what the developer can do next. Primary rendering should not require specialist terminology.

Diagnostics use progressive disclosure: concise actionable rendering first, deterministic offline explanation second, and optional AI assistance third. The compiler remains authoritative. AI may explain structured diagnostics and propose context-aware repairs, but it cannot suppress an error, redefine validity, or be required for baseline Koda tooling.

Mechanically safe edits must be classified by deterministic tooling rather than AI judgment. Exact diagnostic schema, final code registry, CLI commands, AI configuration/provider/privacy contracts, and patch-application UX remain Q07 decisions.
