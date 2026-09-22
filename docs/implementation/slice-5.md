# Compiler slice 5 — immutable lists and iteration

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

Slice 5 gives Koda its first collection: a prelude `List<T>`, literals,
`get`/`length`/`isEmpty`, and `for` iteration — with responsibility tracking
that a variable-length collection cannot get wrong.

```text
.ko source
  -> lexer            + `for` and `in` reserved
  -> parser           + list literals, `for` statements, list member calls
  -> AST              + ListExpression, ForStatement
  -> resolver/checker + prelude List, literal typing, intrinsics, loop scope
  -> obligations      + collective element shape, R1 / R2 / R3
  -> typed IR         + IRList, IRFor, IRListOp
  -> JavaScript       + array literals, `for...of`
  -> runtime          + one `listGet` helper
```

## Accepted language behaviour

### The type

`List<T>` is a prelude type: nominal, invariant, exactly one type argument,
closed against redeclaration. `List<Int>`, `List<Int?>`,
`List<Result<Int, String>>` and `List<List<Int>>` all behave as ordinary
generic applications.

A list is an **immutable value**. No element assignment, no in-place mutation,
no mutable alias. `mut` still means *rebind this name*.

### Literals

```ko
[1, 2, 3]
[
    1,
    2,
]
[User { name: "Thandi" }, User { name: "Kagiso" }]
```

An expected `List<T>` is authoritative and supplies `T` to every element.
Otherwise a non-empty literal takes its element type from its **first** element
and checks the rest against exactly that type — no join, no sibling widening,
no unification.

```ko
[1, "a"]                        // rejected
[1, 2.5]                        // rejected: 2.5 cannot inhabit Int
values: List<Float> = [1, 2.5]  // accepted: the expectation reaches each element
values: List<Int> = []          // accepted
values = []                     // rejected: nothing says what the elements are
```

### Reading

| Operation | Type | Out of range |
| --- | --- | --- |
| `items.length()` | `Int` | — |
| `items.isEmpty()` | `Bool` | — |
| `items.get(index)` | `T?` | `null`, negative indexes included |

An index that names no element is an **absent value**, not a failed operation,
so it is absence rather than a `Result`. There is no indexing syntax.

### Iteration

```ko
for item in items {
    print(item)
}
```

`for` and `in` are reserved words. The binding is immutable, body-scoped, and
may not shadow. A `for` is a statement with no value; an empty list runs the
body zero times; loops nest; `if`, `match` and `return` work inside.
`break` and `continue` are deferred.

### Responsibility

A list carries **one collective responsibility for all of its elements**, and
bears exactly when its element type does.

- **R1** — a loop reaching **normal completion** visits every element, so it
  discharges the list when the binding is discharged on every path that gets
  there.
- **R2** — `get` renews a responsibility for the value returned and leaves the
  list responsible for the rest. `length()` and `isEmpty()` inspect no element
  and discharge nothing.
- **R3** — an early `return` discharges nothing, because the unvisited elements
  were never accounted for.

```ko
for r in results { match r { Ok(v) => ..., Err(e) => ... } }   // accepted
for r in results { print("hello") }                            // rejected
for r in results { match r { Ok(v) => return v, Err(e) => {} } } // rejected
```

Reading a list twice renews on each read, as every repeated read already does.

## Implementation detail

**The lexer needed almost nothing.** `[` and `]` were already `PUNCTUATION` and
already increment `groupDepth`, so newlines inside brackets were already
suppressed and multiline literals containing records already lexed correctly.
The only lexer change is adding `for` and `in` to `KEYWORDS`.

**`List` is an ordinary generic nominal declaration**, built beside
`declarePreludeResult` at `{ module: 0, local: 1 }`. No new `KType` kind: arity,
substitution, `sameType`, `typeName` and invariance all come free. It has no
declared fields, so the obligation shape recognises it by declaration identity —
one more identity check, the same way `Result` is already recognised.

**Intrinsics are a distinct IR node, not calls.** `IRListOp` carries the
receiver and the operation. This is the load-bearing design choice: routing
`items.get(0)` through `IRCall` would have transferred the receiver as an
argument and discharged the whole collection. A separate node lets the
obligation pass treat the receiver as read-but-not-consumed, which is R2.

**R1 and R3 fall out of the existing flow model.** The loop's body is analysed
once; body flows that reach the end are the loop's normal-completion edge and
transfer the collective element node, and a `return` inside the body already
reports every outstanding root before returning no flows. Nothing had to be
added for R3 beyond *not* discharging the collection before the body runs.

**The shape gains one kind.** `kind: "collection"` with a single child under a
fixed key, labelled `[]`. `active()` already returns true for non-enum,
non-nullable kinds, so the child is always visited.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| **Intrinsics may know what user generics cannot** | `items.length()` is accepted on a bearing list; a user-written `fn count<T>(items: List<T>) -> Int` is not. An intrinsic has an implementation the compiler can reason about | **PROVISIONAL — see below** |
| `IRListOp` rather than reusing `IRCall` | Required for R2; a call transfers its arguments | none |
| `listGet` as a runtime helper | JS yields `undefined` out of range, and `undefined` is Koda's Unit, not its absence | none |

### The asymmetry is provisional

**This is not Koda's permanent generic-effect design.** It must be revisited
before a broad `List` standard library, before `map`/`filter`/`reduce`, before
first-class or named-function transformation APIs, and before significant
user-defined generic collection abstractions. Slice 5 introduces no effect
summaries, no does-not-consume annotations, no ownership, no moves and no
polymorphic effect inference.

## Deferred

| Feature | Note |
| --- | --- |
| `append` and every other producer | **A list can only be built by writing a literal.** Accumulation is not expressible; a known practical limitation |
| Indexing syntax `items[i]` | `get` only |
| `break`, `continue` | They create partial-iteration edges that R3 exists to close |
| Maps, sets, comprehensions | Not proposed |
| `map`, `filter`, `reduce`, `find`, `sort` | Need first-class or named-function values, and a generic-effect answer first |
| Closures, first-class functions | Unchanged |
| **Recursive user-defined data** | `type Control { children: List<Control> }` is still rejected. Not worked around |
| Mutable collections, ownership, borrowing | Never in this slice |
| Modules, imports, Q06, Q07 expansion, Q08 expansion | Untouched |

## Diagnostics

| Code | Condition |
| --- | --- |
| `KODA-T0001` | literal element mismatch; `[]` with no expected type; `for` over a non-list; non-Int index |
| `KODA-T0011` | wrong `List` arity |
| `KODA-N0002` | loop binding shadows; user declaration of `List` |
| `KODA-T0009` | unknown operation on a list |
| `KODA-U0001` | `break` / `continue` |
| `KODA-T0012` | a list whose elements were never accounted for |

**No new diagnostic code was introduced.** Structural paths render the
collective element as `[]`, so a nested case reads `results[].value`.

## Power Apps dogfood

`tests/execution/power-apps-shape.ko` builds a simplified, non-recursive
App/Screen/Control model and traverses it with nested loops. It proves Koda can
now walk the *shape* of the data Power Apps YAML tooling will need.

It is not Power Apps integration and adds no YAML syntax. The real model, where
a `Control` contains child `Control`s, **remains rejected** because recursive
user-defined data is still deferred — a concrete, unworked-around blocker for
full Power Apps modelling.

## Ambiguity discovered

**None.** The accepted rules covered every case the implementation reached, and
no stop condition was triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/lists.ko` | literals, nested lists, records and enums in lists, empty contextual literals, `length`/`isEmpty`/`get` in and out of range, `for`, nested `for`, empty iteration, `return` from a loop, contextual numeric retargeting |
| `tests/execution/power-apps-shape.ko` | the non-recursive App/Screen/Control traversal |
| `tests/types/lists.ko` | heterogeneous literals, Int/Float mixing, unconstrained `[]`, arity, shadowing, non-list iteration, non-Int index, `List` redeclaration, `break`/`continue` |
| `tests/types/list-responsibility.ko` | the adversarial matrix: ignored binding, never iterated, `get`-only, `length`-only, early return, nested and nullable element types, repeated iteration, and the Model-B asymmetry |
| `tests/syntax/list-forms.ko` | accepted literal and loop layouts; comparison and generic regressions |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/lists.ko
node packages/cli/dist/src/main.js run tests/execution/power-apps-shape.ko
```
