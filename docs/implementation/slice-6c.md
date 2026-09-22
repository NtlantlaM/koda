# Compiler slice 6C — recursive data

> **This document records an implementation, not a decision.** Accepted language
> behaviour, implementation detail, provisional choices, deferrals and open
> ambiguities are kept in separate sections on purpose.

The Power Apps inspector could describe a flat list of controls and nothing
else, because a control that contains controls is a recursive type and every
recursive declaration was rejected. Slice 6C admits the recursive types that
can be admitted soundly.

```text
.ko source
  -> lexer / parser / AST   (unchanged)
  -> checker                + declaration-level `bears`, two cycle rules
  -> obligations            + the shape stops at the point of recursion
  -> typed IR               (unchanged)
  -> JavaScript             (unchanged)
  -> runtime                (unchanged)
```

## Accepted language behaviour

A declaration may refer to itself when **both** conditions hold.

### It must be inhabitable

A cycle must pass through something that can stop — a nullable, a list, or a
payload-less enum variant, since `null`, `[]` and that variant are base cases.

```ko
type Control { name: String, children: List<Control> }   // accepted
type Node    { value: Int, next: Node? }                 // accepted
type Node    { value: Int, next: Node }                  // rejected
```

The last is not deferred: no finite value inhabits it, because building a
`Node` would need a `Node` first.

### No declaration on the cycle may bear responsibility

```ko
type Control { name: String, children: List<Control> }            // accepted
type Job     { result: Result<Int, String>, children: List<Job> } // rejected
```

A recursive structure holds unboundedly many values, so one whose elements can
each carry a `Result` holds unboundedly many responsibilities. Koda rejects
that rather than tracking it approximately.

The condition covers the whole cycle, not one edge: a declaration reaching a
`Result` through *any* member is bearing.

### Generic recursive declarations stay rejected

```ko
type Tree<T> { value: T, children: List<Tree<T>> }       // rejected
```

An unconstrained type parameter is assumed to bear (Slice 4A), and a
declaration must hold for every instantiation — `Tree<Result<Int, String>>`
included. This follows from that conservative rule and moves with it.

### Enums and mutual recursion are included

```ko
enum Tree { Leaf(value: Int), Branch(children: List<Tree>) }
```

Same two conditions. **A variant carrying nothing is a base case**, so a
variant may hold the type directly — `enum Chain { End, Link(next: Chain) }` is
built as `Chain.End`. An enum whose every variant carries the type back is
uninhabitable and rejected.

### Traversal needs nothing new

Ordinary function recursion already walks recursive data.

## Implementation detail

**Two rules where there was one.** `rejectRecursiveData` used to reject every
cycle. It now classifies each one: bearing → rejected, otherwise
uninhabitable → rejected, otherwise admitted. Each rejection has its own
message; neither is the old blanket "contains itself".

**`bears` is a least fixed point over declarations**, computed in the checker,
which is the only place holding the declaration table. A declaration bears when
any stored member reaches a `Result`, a type parameter, or a bearing
declaration; iteration starts at "nothing bears" and runs to stability. Starting
low is what makes `Control`'s self-reference resolve to *false* rather than
looping.

**Edges gained a `breakable` flag.** Passing through a `Nullable` or through
`List`'s element marks the edge breakable, because both have a base case, and
so does an enum with a payload-less variant. A
cycle with no breakable edge is uninhabitable. Everything else is unchanged,
including the pre-existing conservatism that a type argument cannot hide a
cycle.

**The shape stops at the point of recursion.** `Shapes.of` tracks the
declarations it is currently expanding and returns an opaque non-bearing leaf on
re-entry. Without this the builder would recurse forever, because its cache is
written only after the recursion completes — and a cyclic *shape* would not have
helped either, since `fresh`, `copy` and `mark` materialise children eagerly.

**Stopping is sound because of the checker's rule, not in spite of it.** By the
time shapes are built, every bearing cycle has already been rejected, so there
is provably no responsibility beyond the point where the shape stops.

## Provisional implementation choices

| Choice | Made here | Owner |
| --- | --- | --- |
| Breakability is `Nullable`, `List`, or a payload-less enum variant | Each is a base case. A user generic that stores its argument is not, and one that stores nothing is already excluded by the argument conservatism | none |

## Deferred

| Feature | Note |
| --- | --- |
| Bearing recursive data | Rejected, not approximated. Needs a shape model that can describe unbounded structure |
| Generic recursive declarations | Follows from Model B, which is still provisional |
| `Phantom<Control>` inside `Control` | Still rejected: the pre-existing rule that an argument cannot hide a cycle is unchanged |
| Ownership, runtime tracking, effect summaries | Never |
| YAML, modules, List/String changes | Untouched |

## Diagnostics

No new code. `KODA-U0001` carries both messages:

```text
error[KODA-U0001]: 'Job' can hold outcomes at any depth
   |     this type contains itself, and each level can carry a Result
note: the chain is Job -> List -> Job, through children
note: Koda tracks responsibility structurally, and cannot account for unboundedly many outcomes
note: an unconstrained type parameter counts, because it might be a Result
note: a recursive type is allowed when nothing on the cycle can carry one

error[KODA-U0001]: 'Node' cannot be built
   |     every path back to 'Node' stores one directly
note: the chain is Node -> Node, through next
note: building one would need another first, with nothing to stop it
note: make a step optional with '?', or hold the children in a List
```

## Ambiguity discovered

**None.** The accepted rules covered every case, and no stop condition was
triggered.

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/recursive-data.ko` | a recursive record, a recursive enum, mutual recursion, three-level construction and recursive traversal |
| `tests/types/recursive-data.ko` | bearing cycles direct and indirect, uninhabitable cycles direct, mutual and enum-only, generic recursive declarations, and accepted non-cycle mentions |
| `examples/power-apps-inspector/main.ko` | the nested control tree, inspected recursively |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/recursive-data.ko
node packages/cli/dist/src/main.js run examples/power-apps-inspector/main.ko
```
