# Compiler slice 6A — persistent list construction

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

[Slice 5](slice-5.md) gave Koda a `List<T>` that could be written as a literal
and walked. Slice 6A lets a program **build** one:

```ko
numbers = [1, 2]
more = numbers.append(3)        // numbers is still [1, 2]
```

That is the whole slice.

```text
.ko source
  -> lexer / parser / AST   (unchanged)
  -> checker                + append on a List receiver
  -> obligations            + append is a producer, not an observer
  -> typed IR               + ListOperation "append"
  -> JavaScript             + [...items, value]
  -> runtime                (unchanged)
```

## Accepted language behaviour

### Persistent by construction

`append` returns a **new** list and never changes the one it was called on.
There is no mutating list operation anywhere in the language.

```ko
mut numbers: List<Int> = []
numbers = numbers.append(1)
numbers = numbers.append(2)
```

`mut` still means *rebind this name*; the value itself is never modified. The
same shape works inside a loop:

```ko
mut output: List<String> = []
for item in input {
    output = output.append(item)
}
```

### Typing

`List<T>.append(value: T) -> List<T>`: exactly one argument, checked against the
instantiated element type, returning exactly `List<T>`. Invariance is unchanged,
and ordinary contextual rules reach the argument, so `xs.append(1)` on a
`List<Float>` retargets the numeral exactly as it would anywhere else. Nested
lists, records, enums, nullable elements and a generic `List<T>` receiver all
follow the existing rules.

### Responsibility

`append` accounts for the list **and** the value, and the list it returns is
responsible for both.

This is the ordinary rule — a read is accounted for, the destination renews —
not ownership and not a move. The original list stays readable:

```ko
ys = xs.append(makeResult())
for r in xs { handle(r) }     // accepted: the re-read renews
for r in ys { handle(r) }     // and ys must be handled too
```

Reading the original again and ignoring it is still reported, so nothing
disappears merely because `append` read the list. An accumulated list that is
never handled is reported. Slice 5's R3 still rejects an early `return` out of
an accumulating loop.

## Implementation detail

**Observers and one producer.** Slice 5's intrinsics — `length`, `isEmpty`,
`get` — are *observers*: R2 keeps the list responsible because reading one
element proves nothing about the others. `append` is the first *producer*: it
accounts for what it reads and hands responsibility to its result. That
distinction is the whole design, and it is why append is not routed through the
observer path.

**The engine needed no change.** Before implementing, the existing obligation
engine was exercised with a stand-in of append's exact signature,
`fn joinR(a: List<R>, b: R) -> List<R>`. Every required behaviour already held:
the new list carries both, the old list re-reads and renews, ignoring a re-read
is caught, `mut xs = xs.append(v)` needs no overwrite exception, and loop
accumulation needs no fixed point. Append is that call, spelled as a member.

**No fixed point.** Each accumulation step accounts for the old generation and
renews a new one, so the abstract state after one analysed pass is the state
after any number of runtime iterations. Slice 5's single-pass `for` analysis is
sufficient.

**Lowering** is `[...items, value]` — an array literal, so evaluation order is
written order and the existing operand hoisting handles a side-effecting
argument. Nothing is mutated, nothing is frozen, and no runtime helper was
needed.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| `append` is a compiler intrinsic, not library code | A Koda-written `append` cannot pass Model B's abstract-parameter rule, so intrinsic is the only option today | **PROVISIONAL** — the Slice 5 asymmetry, unchanged |
| Copying lowering, `O(n)` per append | Semantics are "a new list", so a persistent structure can replace it later with no observable change | none |

**Model B remains unchanged and still provisional**, with the same list of
things that must trigger revisiting it.

## Deferred

| Feature | Note |
| --- | --- |
| `prepend`, `concat`, `insert`, `remove` | Not proposed |
| Indexing syntax, `push`/`pop`, mutable lists | Never in this design |
| `map`, `filter`, `reduce`, closures, first-class functions | Need a generic-effect answer first |
| Recursive data | Still rejected; the Power Apps control tree remains unrepresentable |
| `break` / `continue`, modules, String API, Q06/Q07/Q08 | Untouched |

### Known limitation

Accumulation is `O(n²)`: each append copies. This is a backend property, not a
semantic one, so a persistent vector can replace it later without any Koda
program changing meaning.

## Diagnostics

No new code. `KODA-T0001` for an argument that does not match the element type,
`KODA-T0006` for wrong arity, `KODA-T0009` for an unknown operation on a list,
`KODA-T0012` for an accumulated list nobody accounted for.

## Ambiguity discovered

**None.** The pre-implementation inspection required by the authorization
answered every responsibility question from the engine's existing behaviour, and
no stop condition was triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/list-append.ko` | append to empty and non-empty lists, the original left unchanged, repeated append, records, nested lists, nullable values, `mut` self-rebinding, loop accumulation, evaluation order |
| `tests/types/list-append.ko` | wrong element type, wrong arity, append on a non-list, type arguments on append |
| `tests/types/list-append-responsibility.ko` | Result-bearing append, old and new collections independently, ignored re-read, accumulated list abandoned, nested and nullable Result |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/list-append.ko
```
