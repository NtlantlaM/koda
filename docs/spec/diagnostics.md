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
