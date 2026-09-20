# Q03: Mutation and aliasing

State: **AWAITING DECISION**. Selected option: **none**. All refinements remain pending.
Depends on Q11; informs Q04, Q06, Q08, Q10.

Q11 is ACCEPTED via [ADR 0007](../../decisions/0007-q11-type-boundaries.md): no reference/object identity is exposed, and alias-aware mutable smart casts are excluded from v0.1. These are fixed constraints, not pending Q03 refinements; mutation and aliasing policy remain AWAITING DECISION.

## Decision and why it matters

Does mut permit rebinding, field updates with value semantics, or ownership-controlled mutation? Specify nested values and aliases. Immutable bindings alone do not guarantee immutable objects; this affects trust in generated code and future concurrency.

## Alternatives

| Option | Model | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Immutable record/enum contents; mut only rebinds whole values | No mutable alias surprises; simple checker | Verbose record reconstruction; update allocations |
| B | Mutable value semantics: mut permits field updates, copies appear independent | Convenient updates without shared mutation | Correct copying/copy-on-write for nested data is complex |
| C | Ownership/borrow-controlled mutation with exclusive access | Efficient in-place updates and checked aliasing | Lifetimes/borrowing greatly expand the language |

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Exclusive mutable borrowing constrains aliases; shared references restrict ordinary mutation. [Borrowing](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html) |
| Kotlin | val versus var controls property reassignment, not deep immutability of referenced objects. [Properties](https://kotlinlang.org/docs/properties.html) |
| Swift | Structs/enums have value semantics; classes have reference semantics; constant structs cannot have properties changed. [Structures and classes](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/ClassesAndStructures.md) |
| TypeScript | readonly is a checking restriction, not runtime freezing; aliases can expose mutation. [Objects](https://www.typescriptlang.org/docs/handbook/2/objects.html) |
| Go | Struct values and pointers distinguish copying from shared access; reference-bearing fields can still share data. [Effective Go](https://go.dev/doc/effective_go) |
| Python | Names bind objects; object types determine mutability and multiple names can alias an object. [Data model](https://docs.python.org/3/reference/datamodel.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Clear replacement model | Convenient updates, copy rules to learn | Substantial ownership concepts |
| AI-generated code | Accidental field updates diagnosed | Risk of assuming reference behavior | More borrow/lifetime repair cases |
| Compiler complexity | Low for core data | Medium/high mutation lowering | High ownership/lifetime analysis |
| Runtime performance | Cheap immutable sharing, allocating updates | Copies/COW may cost time | In-place updates can be efficient |
| Interoperability | Validate/copy foreign objects | Boundary copies preserve value semantics | Foreign ownership difficult to prove |
| Compatibility | Later mutation can be explicitly distinct | Early copying/identity promise | Ownership permeates API design |

## Recommendation, not acceptance

Recommend **A**. This is an observable guarantee, not a mandate to recursively freeze every emitted object. Internal sharing is fine if callers cannot observe mutation.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Updates | Reconstruction: simple/verbose; with-expression: concise/new grammar; mutable fields: different model | Reconstruction initially |
| Nested fields | Deep immutable core values: strong; shallow: easier/alias risk; capabilities: expressive/complex | All reachable core data immutable; defer foreign mutable handles inside records |
| Enforcement | Compiler-only: fast; runtime freeze: defense/cost; boundary copy/validation: interop cost | Compiler internally, checked/copied boundary representations when object interop arrives |
| Parameters | Immutable: clear; mutable parameter spelling: convenient; inferred mutation: less visible | Immutable parameters, explicit mutable local for rebinding |

Before approval, decide b = a followed by rebinding a, attempted a.field assignment, nested updates, and a foreign function retaining a reference. Distinguish semantic copying from physical copying.


## Expanded v0.1 decision surface

The following refinements remain **AWAITING DECISION**. They make the observable consequences of Option A explicit without accepting it.

### Bindings and `mut`

A binding is immutable by default. Under the recommended Option A, `mut` would permit rebinding the local name to another value of the same type; it would not make the value's fields mutable.

```koda
name = "Koda"
// name = "Koda 2"          // proposed: reject

mut count = 0
count = count + 1            // proposed: allow
```

For structured values, this distinction remains visible:

```koda
mut user = User { name: "Ntlantla" }

// user.name = "Killo"       // proposed: reject field mutation
user = User { name: "Killo" } // proposed: allow rebinding
```

Exact declaration and update spelling belongs to Q01.

### Core value semantics and aliases

Ordinary `type`, enum, primitive, and core collection values should be specified by value rather than exposed reference identity. Assignment may share storage internally, but later rebinding of one name must not observably mutate another value.

```koda
a = User { name: "Ntlantla" }
mut b = a
b = User { name: "Koda" }

// a remains User { name: "Ntlantla" }
```

This is semantic independence, not a requirement for eager physical copying. Implementations may use immutable sharing, structural sharing, or copy-on-write when behavior is indistinguishable.

### Nested data

The recommended model is transitively immutable for ordinary reachable Koda core values. An immutable outer value must not hide a mutable ordinary record or collection whose mutation becomes observable through an alias.

```koda
user = User {
    name: "Ntlantla"
    address: Address { city: "Johannesburg" }
}

// user.address.city = "Pretoria" // proposed: reject
```

Ergonomic immutable-update syntax may be added by Q01, but its semantics must produce a new value.

### Function parameters

Parameters should be immutable bindings in v0.1. A function must not silently mutate an ordinary value owned by its caller.

```koda
fn rename(user: User) -> User {
    // return a new User value
}
```

A function may create an explicit mutable local and rebind that local without changing the caller's value. Mutable-reference parameters, `inout` parameters, inferred mutation, and borrow syntax are deferred unless separately accepted.

### Collections

Core collections should follow the same value semantics as ordinary Koda data. Mutating collection APIs are not part of the recommended v0.1 core model. Operations that conceptually add, remove, or replace elements should produce new collection values; a `mut` binding may then be rebound to the result.

The semantic guarantee does not choose the physical implementation. Persistent data structures, structural sharing, and copy-on-write remain implementation strategies.

### Closures and captured state

A closure may read captured immutable bindings. Whether a closure may capture and rebind a `mut` local is still **NOT YET SPECIFIED** and must be frozen before closure mutation is part of v0.1. Escaping mutable captures interact with concurrency and hidden shared state, so they must not be inferred from JavaScript closure behavior.

### Entities and effectful resources

Q03 does not make database entities, files, sockets, UI handles, foreign objects, or similar resources ordinary mutable records. These values may represent external identity and effects and require explicit resource/persistence semantics.

Entity update and identity remain Q09 decisions. Q03 must not silently commit Koda to an Active Record model such as field mutation followed by `save()`.

### Foreign JavaScript objects

JavaScript object identity and mutability must not leak into ordinary Koda core values accidentally. When a foreign object is converted to a Koda core value, the boundary must validate and copy/snapshot as necessary to preserve Koda semantics.

Explicit foreign handles may retain foreign identity and mutation, but such handles are effectful/interop values governed by Q06/Q08 rather than ordinary records. A foreign function retaining a reference to a Koda value must not gain a path to observably mutate that Koda value.

### Copying and cloning

Because core values expose value semantics, ordinary assignment does not require a user-visible `clone` operation merely to avoid aliases. A future explicit copy/clone API may exist for resources, buffers, performance-sensitive data, or interop, but its spelling and guarantees are deferred.

### Concurrency

Immutable core values should be safe to share across concurrent tasks by default. Mutable local rebinding is task-local unless a future concurrency feature explicitly introduces shared state. Shared mutable resources require a concurrency/effect model in Q10 and must not arise merely from aliasing ordinary values.

### Equality

Q11's accepted equality constraints continue to apply. Q03 must not introduce observable object/reference identity for ordinary records. Mutation policy therefore cannot make reference identity part of ordinary equality.

### Ownership and borrowing

Full Rust-style ownership, borrow checking, lifetime syntax, and move semantics are not recommended for v0.1. They impose substantial language and diagnostic complexity and are not required to provide immutable core values with explicit effectful resources.

This does not prevent a future capability, uniqueness, region, or ownership mechanism for specialized resources if later requirements justify one.

### Deep immutability versus runtime freezing

The proposed guarantee is semantic deep immutability for ordinary core values, not mandatory recursive runtime freezing of every backend object. The compiler/runtime may share or optimize representations as long as Koda programs cannot observe mutation that violates the language model.

Foreign boundaries require validation, copying, wrappers, or handles sufficient to preserve that guarantee.

## Decisions required before Q03 acceptance

The following semantic questions should be resolved before Q03 becomes ACCEPTED:

1. Whether immutable-by-default bindings and explicit rebinding are the v0.1 model.
2. Whether `mut` means rebinding only for ordinary core values.
3. Whether ordinary records/enums expose transitively immutable value semantics.
4. Whether assignment aliases may share physical storage while remaining semantically independent.
5. Whether ordinary function parameters are immutable and cannot mutate caller values.
6. Whether mutable-reference/`inout` parameters are deferred.
7. Whether core collections are immutable values in v0.1.
8. Whether persistent collections are a semantic requirement or merely an implementation option.
9. Whether closure capture of mutable locals is allowed, restricted, or deferred.
10. Whether entity mutation remains wholly under Q09.
11. Whether foreign mutable objects require explicit handles or snapshot conversion.
12. Whether user-visible cloning is unnecessary for ordinary values.
13. Whether ordinary values are shareable across concurrency boundaries by virtue of immutability.
14. Whether shared mutable state requires an explicit future resource/concurrency mechanism.
15. Whether Rust-style ownership/borrowing is rejected for v0.1.
16. Whether deep immutability is a semantic guarantee rather than a runtime-freezing mandate.

## Classification

### MUST FREEZE FOR V0.1

- binding immutability and rebinding semantics
- meaning of `mut`
- field/nested-value mutation
- ordinary value and alias semantics
- function-parameter mutation
- core collection mutation semantics
- foreign-boundary preservation of core value semantics
- whether ownership/borrowing is part of the core language

### CAN WAIT FOR Q01 SPELLING

- exact `mut` declaration syntax
- immutable update/with-expression syntax
- any future explicit conversion/copy API names
- diagnostic wording and update-expression grammar

### CAN DEFER BEYOND V0.1

- mutable-reference/`inout` parameters
- ownership/lifetime syntax
- specialized mutable buffers
- observable clone/copy controls for performance
- shared-memory concurrency primitives
- resource uniqueness/capability systems
- persistent-collection implementation choice
- entity persistence/update behavior beyond the Q03 boundary
