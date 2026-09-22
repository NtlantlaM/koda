# Compiler slice 6B — string inspection

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

Koda could build strings and compare them whole, and nothing else. The first
dogfood application — the Power Apps inspector — could not implement its central
rule, "a Button must be named `btn_*`", because no operation could look inside a
string. Slice 6B adds the five read-only operations that rule needs.

```text
.ko source
  -> lexer / parser / AST   (unchanged)
  -> checker                + string operations on a String receiver
  -> obligations            + a string operation bears nothing
  -> typed IR               + IRStringOp
  -> JavaScript             + scalar-counted helpers, native matching
  -> runtime                + slength / sget
```

## Accepted language behaviour

| Operation | Type | Behaviour |
| --- | --- | --- |
| `text.length()` | `Int` | how many scalar values |
| `text.get(index)` | `String?` | the one-scalar string there, or `null` |
| `text.startsWith(prefix)` | `Bool` | |
| `text.endsWith(suffix)` | `Bool` | |
| `text.contains(value)` | `Bool` | |

### Scalar values, not code units

```ko
"A😀B".length()      // 3
"A😀B".get(1)        // "😀"
```

The emoji is one scalar value and counts once. **No UTF-16 length or indexing
is inherited from JavaScript**, where the same string has length 4 and index 1
is half a surrogate pair.

### Absence, not failure

An index naming no scalar — **negative included** — yields `null`, so `get`
returns `String?`. This is `List.get`'s rule: a position that names nothing is
an absent value, not a failed operation, so it is absence rather than a
`Result`.

### Read-only

None of these produces a modified string; strings stay immutable and there is
no string mutation anywhere in the language.

## Implementation detail

**Two helpers, three natives.** `length` and `get` need scalar counting, so they
go through the runtime: `[...text]` iterates by code point, which is exactly the
scalar sequence. `startsWith`, `endsWith` and `contains` lower to JavaScript's
`startsWith`, `endsWith` and `includes` directly.

**Why native matching is scalar-correct.** Those three compare code units, which
would be wrong only if a match could begin or end part-way through a surrogate
pair. That requires a needle starting with a low surrogate or ending with a high
one — a lone surrogate, which is not a valid Koda string and cannot be written
as a literal. With valid inputs, code-unit matching and scalar matching agree,
so no helper is needed and none was added.

**`IRStringOp`, mirroring `IRListOp`.** A separate node rather than a call, for
the same reason: the checker fixes the signatures, and the obligation pass sees
a shape it can reason about. It is far simpler than the list case, because a
`String`, a `Bool`, an `Int` and a `String?` all bear nothing — so the operation
walks its operands and produces a non-bearing result, with no observer/producer
distinction to make.

**Dispatch** sits beside the list intrinsics in `checkCall`'s member path: a
`String` receiver routes to `checkStringOperation` before the
"cannot be called" fallback.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| Compiler-known operations rather than library code | Koda cannot express them as library code yet, exactly as with the list operations | **PROVISIONAL** — the Slice 5 asymmetry, unchanged |
| `length` and `get` are `O(n)` — each spreads the string | Correctness first. A cached scalar view or a UTF-8 representation could replace it with no observable change | none |

## Deferred

| Feature | Note |
| --- | --- |
| Slicing, substrings, `split`, `join` | Not proposed |
| Case conversion, trimming, replacement, padding | Not proposed |
| Ordering comparison (`<` on String) | Still rejected |
| Code-point ↔ Int conversion, `String` ↔ `Int` parsing | Still missing |
| String mutation | Never |
| Recursive data, YAML, modules, Q06/Q07/Q08 | Untouched |
| Result responsibility semantics | Unchanged |

## Diagnostics

No new code. `KODA-T0001` for a non-String argument or a non-Int index,
`KODA-T0006` for wrong arity, `KODA-T0009` for an unknown operation on a string.

## Ambiguity discovered

**None.** The accepted rules covered every case, and no stop condition was
triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/strings-inspect.ko` | scalar length and indexing including astral characters, `get` in range, out of range and negative, all three predicates, empty strings and empty needles |
| `tests/types/string-operations.ko` | non-String argument, non-Int index, wrong arity, unknown operation, ordering still rejected, mutation still absent |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/strings-inspect.ko
node packages/cli/dist/src/main.js run examples/power-apps-inspector/main.ko
```
