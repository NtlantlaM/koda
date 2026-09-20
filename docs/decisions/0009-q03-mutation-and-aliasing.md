# ADR 0009: Q03 mutation and aliasing

- Status: ACCEPTED
- Date: 2026-09-20
- Decision: Q03 Option A with explicit v0.1 refinements
- Depends on: ADR 0007 (Q11 type boundaries)
- Informs: Q04, Q06, Q08, Q10, Q09

## Context

Koda needs mutation semantics that remain predictable for beginners and AI-generated code without importing JavaScript's shared mutable object model or Rust's ownership/lifetime complexity. Q11 already forbids exposed object/reference identity for ordinary values and excludes alias-aware mutable smart casts from v0.1.

An immutable binding alone is insufficient if reachable objects remain mutable through aliases. The language therefore needs a semantic distinction between rebinding a local name and mutating the contents of an ordinary value.

## Decision

Koda v0.1 uses immutable core value semantics with explicit local rebinding.

1. Bindings are immutable by default.
2. An explicitly mutable binding may be rebound to another value of the same type.
3. For ordinary core values, `mut` does not grant field mutation.
4. Ordinary records, enums, primitives, and core collections are transitively immutable values.
5. Assignment/copying may physically share storage, but that sharing is unobservable. Rebinding one alias cannot mutate another.
6. Ordinary function parameters are immutable and cannot mutate caller-owned core values.
7. Mutable-reference and `inout`-style parameters are not in v0.1.
8. Core collection operations that conceptually update a collection return a new value. Persistent data structures, structural sharing, and copy-on-write are implementation choices rather than language guarantees.
9. v0.1 closures may capture immutable bindings. Capturing and rebinding mutable locals is deferred.
10. Entity identity and persistence mutation remain Q09 concerns. Q03 does not imply Active Record field mutation plus `save()`.
11. Foreign mutable objects cannot masquerade as ordinary Koda values. Interop must use validated/snapshot conversion or explicit foreign handles.
12. Ordinary assignment does not require a user-visible clone operation merely to avoid aliasing.
13. Ordinary immutable values may be shared across future concurrency boundaries. Shared mutable state requires an explicit future resource/concurrency mechanism.
14. Rust-style ownership, borrow checking, lifetime syntax, and move semantics are excluded from v0.1.
15. Deep immutability is an observable semantic guarantee, not a mandate to recursively freeze every emitted JavaScript object.

## Examples

Exact syntax remains subject to Q01, but the accepted semantics are:

```koda
name = "Koda"
// name = "Koda 2"          // immutable binding: reject

mut count = 0
count = count + 1            // mutable binding: rebind
```

For structured values:

```koda
mut user = User { name: "Ntlantla" }
// user.name = "Killo"       // reject: ordinary fields are immutable
user = User { name: "Killo" } // rebind to a new value
```

Aliases remain semantically independent:

```koda
a = User { name: "Ntlantla" }
mut b = a
b = User { name: "Koda" }
// a still denotes the original value
```

## Consequences

- Function effects are easier to reason about because ordinary parameters cannot hide caller mutation.
- AI-generated code cannot accidentally rely on JavaScript-style shared object mutation.
- Immutable values can be physically shared and optimized without exposing reference identity.
- Ergonomic nested updates need separate Q01 syntax or library APIs.
- Foreign object interop requires explicit boundary machinery.
- Resource-like values with external identity require later effect/resource semantics.
- Concurrency can build on immutable sharing without requiring a v0.1 borrow checker.

## Explicit deferrals

- mutable-reference/`inout` parameters
- capture/rebinding of mutable locals by closures
- ownership, borrowing, lifetime and move syntax
- specialized mutable buffers
- user-visible copy/clone controls for performance-sensitive resources
- shared-memory concurrency primitives
- resource uniqueness/capability systems
- persistent-collection implementation strategy
- entity identity/update/persistence semantics
- exact immutable-update/with-expression syntax
- exact mutable-binding spelling, subject to Q01

## Compatibility rule

Future features may add explicit mutable resources or specialized ownership/capability mechanisms, but they must not retroactively make ordinary v0.1 core values observably mutable or expose reference identity for them.
