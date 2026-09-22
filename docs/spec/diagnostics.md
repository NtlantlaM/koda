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
| KODA-T0002 | Unsafe nullable access | The nullable declaration, and a `match` or `x != null` example |
| KODA-T0003 | Non-exhaustive match | Concrete missing variants |
| KODA-T0004 | Reassignment to immutable binding | Declaration span and explicit `mut` option |
| KODA-T0005 | Discarded Result expression | Handle, return, or bind the result |
| KODA-T0012 | Outstanding Result leaving scope | Where it became outstanding, and how to discharge it |
| KODA-T0013 | Overwrite of an outstanding Result | The earlier value, and handling it before reassigning |
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
note: 'count' was declared without 'mut' at src/main.ko:2:5
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

## Slice 2A generic diagnostics

Accepted Q11/Q01 rules require source-located errors for empty declaration
parameter lists, duplicate parameters, primitive/prelude type-name collisions,
unknown argument types, incorrect type arity, unapplied generics, arguments on
nongeneric types, invariant mismatches and recursive data. Written `T??`
continues to be a syntax error.

The implementation reuses `KODA-P0001` for malformed lists, `KODA-N0001` for
unknown types, `KODA-N0002` for duplicate/colliding parameters, `KODA-T0001`
for type mismatches, and `KODA-U0001` for deferred constructs and recursion.
`KODA-T0011` is a **candidate implementation code** for generic type-argument
arity, including unapplied generic and nongeneric applications. Its diagnostics
state expected/supplied counts for generics, reject arguments on nongeneric types, and reference the declaration when available.
This adds no final Q07 registry decision.

### Generic functions (Slice 4A)

Generic functions and calls introduce no new code. `KODA-N0002` covers a
duplicate or reserved type-parameter name. `KODA-T0011` covers a missing,
empty, or wrongly counted type-argument list, and type arguments written on a
function that declares none; its message states that Koda requires them to be
written and never offers inference as the fix. `KODA-T0001` covers an argument
that does not match its **substituted** parameter type — the message names the
substituted type, never the type parameter — and an operation an unconstrained
type parameter does not support, worded so it does not imply that a constraints
feature exists. `KODA-U0001` still covers bounds, defaults and variance.

`KODA-T0012` covers an abstract type-parameter responsibility left outstanding.
Its notes explain that the value's type is an unconstrained type parameter, so
Koda cannot tell whether it holds an outcome, and that the function must hand
it onward. It does **not** suggest matching the value, because an abstract type
parameter cannot be matched.

No diagnostic exposes a declaration identity, an owner id, an internal module
id, or obligation implementation vocabulary.

### Lists and iteration (Slice 5)

Lists introduce no new code. `KODA-T0001` covers a literal element that does not
match the element type (naming the first element's span as the origin when the
type came from there), an empty `[]` with no expected type, a non-list iterated
by `for`, and a non-Int index. `KODA-T0011` covers wrong `List` arity.
`KODA-N0002` covers a loop binding that shadows, and a user declaration of the
closed `List` name. `KODA-T0009` covers an unknown operation on a list.
`KODA-U0001` covers `break` and `continue`, which remain deferred.

`KODA-T0012` covers a list whose elements were never accounted for: never
iterated, iterated with the binding ignored, read only through `get`,
or abandoned by an early `return` from the loop. Structural paths render the
collective element as `[]`, so a nested case reads `results[].value`.

An empty-literal diagnostic states that Koda cannot know the element type and
does not invent one; it offers an annotation, a return type or a parameter
position, and never offers inference.

Generic functions and generic calls were previously unsupported. Diagnostic
text distinguishes those exclusions from supported generic data declarations and
construction; no suggestion invents a call or inference syntax.

### Generic construction (Slice 3A)

Construction reuses the codes above and introduces none of its own.
`KODA-T0011` covers a wrong argument count at a construction site, an empty
`Box<>`, and arguments written on a nongeneric type. `KODA-T0001` covers a
construction with no complete expected type, written arguments that disagree
with the context, and a value that does not match its **instantiated** field or
payload type. `KODA-T0008`, `KODA-T0009` and `KODA-T0006` keep their existing
meanings for missing fields, unknown members and payload arity.

An unconstrained construction states that nothing names the type arguments,
offers both remedies — writing them, or supplying a context — and says plainly
that Koda does not infer an argument from a field's value. No suggestion
proposes inference as a fix.

## Slice 3B structural responsibility diagnostics

KODA-T0005 covers discarded Result-bearing expressions and temporary residuals,
including nullable Result calls. KODA-T0012 covers outstanding structural paths
at scope exit/return; KODA-T0013 covers old-generation paths on replacement.
Name paths such as p.second, include origins and useful wildcard/projection
locations, and report each responsibility once in deterministic order. Existing
code/schema status remains provisional under Q07. No new code is required.
