# Q05-A — declaration identity foundation

> **This document records an implementation, not a decision.** It is a
> behaviour-preserving refactor: no Koda program changes meaning, no diagnostic
> changes, and no emitted JavaScript changes.

Q05-A removes the compiler's assumption that a declaration is identified by a
bare checker-local integer. It implements only the identity model accepted from
the Q05 investigation; the user-visible module system is deliberately absent.

## Why bare numeric ids were insufficient

Nominal identity is the foundation of Koda's type system: two declarations with
identical fields are distinct types ([ADR 0007](../decisions/0007-q11-type-boundaries.md)).
Before this slice, that identity was a counter that restarted at `0` in every
`Checker` instance, and equality was a single integer comparison.

With one source file the counter is unique by accident. With two, it is not:

```text
module users     Result -> 0    User  -> 1
module payments  Result -> 0    Order -> 1
```

`User` and `Order` would have compared **equal**, and an `Order` would have been
accepted wherever a `User` was expected. Not a diagnostic and not a crash —
silent unsoundness at the centre of the type system.

The same collision reached three further places: generic type-parameter owners,
the obligation shape cache, and recursive-data cycle detection.

This had to be fixed before generic functions, not after. A `fn identity<T>`
needs a function to *own* a type parameter, and `ownerId` was literally a
declaration id, which only records and enums had. Slice 4A would otherwise have
invented a temporary owner identity and written inference — the most delicate
code in the compiler — against a shape that was about to change.

## The identity invariant

```ts
interface DeclarationId {
  readonly module: number;
  readonly local: number;
}
```

> Two declarations are the same declaration when their module and local
> components are both equal. Nothing else makes them equal, and reference
> identity is never consulted.

Comparison goes through one helper, so the invariant lives in a single place:

```ts
sameDeclarationId(a, b)     // structural equality, never `a === b`
declarationKey(id)          // "m:l", for maps, caches and cycle detection
```

Two separately constructed `{ module: 1, local: 2 }` values are the same
identity. That property is tested directly rather than inferred from source
fixtures, because Koda syntax cannot yet produce two modules.

### Module numbering

| Module | Id |
| --- | --- |
| Prelude | `0` |
| The entry module | `1` |

`local` is a per-module counter, which is what the old global counter becomes.
Future modules take `2`, `3`, … from a graph-wide allocator; the representation
does not change when they do.

## Generic owner identity

Records, enums **and functions** now draw their local ids from the same
per-module allocator, so any of them can own type parameters:

```text
type Box<T>              owner { module: 1, local: 0 }   T = owner + index 0
fn identity<T>(...)      owner { module: 1, local: 3 }   T = owner + index 0
```

A type parameter is equal to another only when the owner identity is equal
**and** the index is equal — the pre-existing rule, with a widened owner.

Allocating ids to functions is infrastructure only. Function declarations
receive an identity; no function may declare type parameters yet, and the
parser still rejects `fn f<T>(...)`. What changes is that Slice 4A can add them
without a second identity redesign.

## Canonical prelude and Result identity

`Result<T, E>` must be the same nominal declaration everywhere in a
compilation, because [ADR 0010](../decisions/0010-q04-result-obligations.md)'s
must-handle analysis recognises it by identity.

The prelude is module `0`, and `Result` is `{ module: 0, local: 0 }`. Every
checker in a compilation resolves the same identity for it.

Before this slice each `Checker` synthesised its own `Result` at id `0`. Two
modules' Results would have compared equal *by accident* — the right answer for
the wrong reason, and an accident that stops holding the moment local ids are
made unique per module. The prelude module id makes it correct by construction.

### Deliberate internal seam

The prelude is **not** a compiled source module. It has canonical identity and
nothing else: no `SourceFile`, no `IRModule`, no loader, no import.

Building a real prelude module would have required the multi-source compilation
machinery that Q05-B owns, so this slice stops at identity. The seam is
`declarePreludeResult`, which still constructs the `Result` declaration
in-process — now under module id `0` instead of the entry module's counter.

This is an honest half-measure, recorded as one. The prelude is not yet a
module; it merely has the identity a module would give it.

## Identity is internal

Declaration identity never appears in Koda source, human diagnostics, JSON
diagnostics, emitted JavaScript or the runtime. It is a compiler-internal
comparison key, and a test asserts that no emitted module or rendered
diagnostic exposes one.

## What remains deliberately unimplemented

| Not in this slice | Owner |
| --- | --- |
| `import` syntax, module qualifiers, visibility enforcement | Q05-C |
| Multi-source compilation, module graph, resolution, cycles | Q05-B |
| Multi-module emission | Q05-D |
| The prelude as a genuinely compiled module | Q05-B |
| Generic functions, generic calls, inference | Slice 4A |
| Cross-module recursive-data analysis | Q05-B |
| Any change to Result semantics or obligation behaviour | — |
| Any Q06, Q07 or Q08 decision | — |

## Running it

```bash
npm run build
npm test
```
