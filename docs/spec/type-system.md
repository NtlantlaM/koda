# Type system

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** Q11 rules are recorded in [ADR 0007](../decisions/0007-q11-type-boundaries.md), alongside the user principles of strong typing, immutable defaults, null safety, explicit results, and enum matching. Numeric behavior is **ACCEPTED** in [Q02 / ADR 0008](../decisions/0008-q02-numeric-semantics.md). Mutation and Result obligations are accepted in ADRs 0009 and 0010; concrete syntax is accepted in ADR 0011. Remaining feature-specific gaps do not reopen those decisions.

## Types and inference

Proposed primitives are `Bool`, `String`, `Int`, `Float`, and `Unit`. There is no user-visible `any`, implicit coercion, or automatic conversion from JavaScript values in the baseline proposal. Q11 accepts inference of local variable and call-result types, with explicit parameter and return types required at function boundaries, including private functions. Detailed generic-call inference rules remain to be specified; they must respect the accepted invariant generic model.

An unconstrained `null` or `Ok`/`Err` type parameter needs context or an annotation in the baseline inference proposal; inference must not invent an unsafe type. Ordinary function recursion is accepted and uses declared signatures. Small invariant user-defined generics are supported in v0.1; variance and advanced generic constraints are deferred. Generic bodies must type-check for their allowed substitutions; operations cannot be assumed for an unconstrained parameter.

Koda-defined types have nominal identity. Two different `type` declarations with identical fields are distinct types; `enum` declarations are nominal as well. The baseline construction proposal requires every field exactly once and rejects unknown fields. No structural interchangeability follows solely from matching shapes. Recursive user-defined data types are deferred; this does not restrict ordinary function recursion.

Local and parameter shadowing is rejected, including same-scope duplicate declarations. This does not choose Q01's type/value namespace or prelude-name rules.

## Mutability

```ko
name = "Koda"
mut count = 0
count = count + 1
```

An immutable binding cannot be reassigned. ADR 0009 makes ordinary core values transitively immutable and allows `mut` to rebind the whole value. Core collection updates return new values. Mutable-reference parameters, ownership/borrowing and shared mutable resources are outside v0.1. JavaScript interop must not silently expose foreign mutable objects as immutable Koda records.

## Nullable values

`T?` contains a `T` value or `null`. `T` can be used where `T?` is expected; the reverse requires a check. `null` is not a value of non-nullable `T`. Explicitly written `T??` is rejected. Nullable generic substitution flattens where necessary: substituting a nullable type for `T` in `T?` does not create an observable second absence layer.

```ko
fn display(name: String?) -> String {
    match name {
        null => "Anonymous",
        value => value,
    }
}
```

After the `null` arm, `value` binds the remaining non-null `String`. A binding arm placed *before* a `null` arm catches the remaining nullable domain and makes the later `null` arm unreachable.

Null refinement is accepted both through `match` and through explicit null checks. This does not authorize alias-aware mutable smart casts in v0.1 or extend the guarantee to mutable bindings or aliased properties. Access through a nullable value requires appropriate refinement. Foreign `undefined` mapping remains a Q06 decision.

### Explicit null checks

An explicit null check is written `x != null` or `x == null`. Equality and inequality accept a nullable operand compared against `null`. **That comparison is an absence test**: it asks whether a value is present, and neither uses nor enables ordinary equality for the underlying type. `user == null` is valid for a `User?` even though `user1 == user2` remains invalid while derived equality for user-defined value types is deferred. This is not general mixed-type equality. A non-nullable `T` compared directly with `null` is invalid, and an unconstrained comparison such as `null == null` is invalid without sufficient type context.

A binding is refinable when it is **stable** — it cannot be rebound during the refinement's lifetime. Eligible: immutable local bindings and immutable function parameters, the latter being immutable under [ADR 0009](../decisions/0009-q03-mutation-and-aliasing.md) items 6 and 7. Not eligible: mutable locals, member expressions and arbitrary expressions.

Both directions refine. The non-null branch is the `then` branch of `x != null` and the `else` branch of `x == null`; there the binding has type `T`.

Refinement is **lexical**. A nested scope inherits an active refinement, and at an ordinary control-flow join the binding returns to its declared nullable type.

Refinement composes **left to right through `&&`**: the right operand is checked under the refinements its left operand establishes, so in `if user != null && allowed(user)` the call receives a non-null `User`, and both refinements hold in the body. Order matters. No general Boolean-flow analysis is implied.

Deferred, and therefore not sources of refinement: early-return and post-dominator narrowing, so a binding stays nullable after `if x == null { return }`; `||`; negation; an intermediate `Bool` binding; and arbitrary equivalent Boolean expressions.

## Results and matching

Prelude declaration:

```ko
enum Result<T, E> {
    Ok(value: T)
    Err(error: E)
}
```

The payload field names `value` and `error` are accepted (2026-09-21). `Result`
is an ordinary closed enum under the accepted generic rules: nominal, invariant,
and applied with exactly two arguments.

### Constructing a Result

Its constructors are the prelude names `Ok` and `Err`, written **unqualified and
positionally**:

```ko
Ok(user)
Err(error)
```

`Result.Ok(...)` and `Result.Err(...)` are not v0.1 spellings. Ordinary
user-defined enum variants remain qualified; `Ok` and `Err` are the accepted
exception.

A constructor determines only its own payload, so the rest of the type must come
from an expected-type context. `Ok` and `Err` follow the general rule stated
under [contextual construction](#contextual-construction): the contexts are an
annotated binding, a function's final expression, an explicit `return`, or an
argument position, and a nullable `Result<T, E>?` expectation is looked through
by exactly one outer nullable wrapper.

Result was the first construct to use that rule. It is **not** a Result-only
exception: since Slice 3A the same rule governs every contextual construction.

Without such a context the constructor is rejected rather than completed with an
invented type:

```ko
result = Ok(42)     // rejected: nothing says what Err would hold
```

### Matching a Result

```ko
match result {
    Ok(value) => ...
    Err(error) => ...
}
```

`Ok` binds `T` and `Err` binds `E` under ordinary generic substitution. Binding
names are fresh pattern locals and need not match the declared field names. For
a non-nullable `Result<T, E>`, `Ok` and `Err` are the complete variant domain,
so covering both is exhaustive.

`Result<T, E>` is an ordinary closed enum with prelude constructor names `Ok` and `Err`. It is not an exception mechanism. A function handles a result with `match`, returns it, or stores it for subsequent handling. No implicit unwrapping or propagation occurs. A bare Result-valued expression statement is a compile error; an unused Result binding also needs a diagnostic. ADR 0010 makes reachable abandonment and overwrite errors and permits deliberate ignoring through explicit outcome matching; the compiler does not claim that passing or storing a result proves meaningful business-level handling. Direct enforcement began in [Slice 2C](../implementation/slice-2c.md); [Slice 3B](../implementation/slice-3b.md) extends it through stored structural members and temporaries.

### Discharging a Result obligation

Binding a Result does not discharge it: `result = operation()` creates an outstanding responsibility. It is discharged by explicitly handling the value, returning it, passing it onward, or storing it into a value.

Handling through `match` requires **both alternatives to be visible**:

```ko
match result {
    Ok(value) => ...
    Err(error) => ...
}
```

`Ok(_)` and `Err(_)` acknowledge the outer Result, because both alternatives are named. Any nested Result-bearing payload remains independently outstanding. `Ok(value)` followed by `_`, and a lone `_`, do **not** discharge. Exhaustiveness and discharge are separate properties: a wildcard can make a match exhaustive without making the failure visible.

A Result **parameter** begins its function with an outstanding obligation, so a function cannot become a reusable way to swallow failure. Binding an outstanding Result into another name **transfers** it: after `second = first`, the responsibility belongs to `second`. An outstanding Result may not be overwritten; rebinding a `mut` Result that has already been discharged starts a fresh obligation.

Obligations are checked at every scope exit and at every `return`. A Result handled on only one branch of an `if` remains outstanding after the join; one handled on one branch and transferred on the other is discharged.

A binding whose own type is `Result<T, E>?` carries an obligation, discharged by the nullable match that exposes absence and presence; the bound present value then carries its own.

**Historical boundary.** Slice 2C tracked only bindings whose own type was Result or Result?. Slice 3B closes that container limitation: receiving stored fields/payloads renew responsibility, structural siblings remain independent, and abandoned temporary residuals are diagnosed. See the structural responsibility section below.

Match exhaustiveness covers enums, `Bool`, and nullable types. Matching open domains such as numbers and strings requires a catch-all binding or `_`. Arms are considered in order; unreachable arms are diagnosed. Each variant's payload must have the correct arity. All value-producing arms must agree on a type, allowing only explicit nullable injection. No implicit union inference is proposed.

## Accepted numeric semantics and equality

`Int` is checked signed 64-bit and `Float` is IEEE-754 binary64 on every backend. [Numeric semantics](numbers.md) defines accepted Q02 literal typing, explicit conversions, truncating division/remainder, checked faults, binary64 special values, and boundary validation. JavaScript implementation choices cannot redefine these rules. Decimal is reserved but unusable in v0.1.

Primitive equality is supported in v0.1. Q02 requires matching typed numeric operands for equality and ordering; mixed Int/Float comparisons require explicit conversion. NaN is unequal to itself and all its ordering comparisons are false; signed zeros compare equal. Reference/object identity is not exposed. A nullable value may be compared with `null` using `==` and `!=`; that comparison is an absence test and neither uses nor enables equality for the underlying type. Derived equality for user-defined value types is deferred; entity identity/equality is a later persistence decision under Q09. Ordering remains numeric only in the baseline proposal.

## Strings

Strings have Unicode scalar-value semantics. Equality compares exact scalar-value sequences without normalization; canonical equivalence alone does not make differently represented sequences equal. Invalid/lone surrogate values are rejected at foreign boundaries; Q06 still determines the surrounding conversion/error contract.

String interpolation and multiline strings are supported. ADR 0011 defines their surface spelling and escaping; unresolved multiline layout details remain separate; numeric interpolation follows [Q02's canonical formatting rules](numbers.md); nonnumeric interpolation conversion rules remain to be specified.

### Inspecting a string (Slice 6B)

| Operation | Type | Behaviour |
| --- | --- | --- |
| `text.length()` | `Int` | how many **scalar values**, not code units |
| `text.get(index)` | `String?` | the one-scalar string at that position, or `null` when the index names none |
| `text.startsWith(prefix)` | `Bool` | whether the text begins with `prefix` |
| `text.endsWith(suffix)` | `Bool` | whether the text ends with `suffix` |
| `text.contains(value)` | `Bool` | whether `value` occurs anywhere in the text |

**Every operation counts scalar values.** `"A😀B"` has length 3, and `get(1)` is
`"😀"` - one scalar, not half a surrogate pair. **No UTF-16 code-unit
indexing or length definition is inherited from JavaScript.** A position that
names no scalar, negative indexes included, is an *absent value*, so `get`
returns `String?` rather than a `Result` - the same rule `List.get` follows.

A prefix, suffix or search value is matched as a scalar sequence. Because Koda
strings never contain a lone surrogate, a match can never begin or end part-way
through one.

Strings remain immutable, and these operations only read: none of them produces
a modified string. Slicing, substrings, splitting, case conversion, trimming
and ordering comparison all remain deferred.

## Failure boundary

Expected failures use `Result`. Unrecoverable runtime failures such as violated runtime invariants or exhausted resources are fatal and cannot become arbitrary successful values. Q02 fixes source-located checked integer faults and Result-returning fallible numeric conversions; see [the separate constant-evaluation contract](numbers.md#arithmetic-faults-and-constant-evaluation-s17). Fault transport and exit reporting remain Q04/Q07 integration work. JavaScript exceptions require the explicit interop policy in Q06.

## Generic data types (Slice 2A)

Status: **ACCEPTED**, explicit human clarification of Q11 on 2026-09-21.
[ADR 0007](../decisions/0007-q11-type-boundaries.md) owns these semantics.

Records and enums may declare unconstrained type parameters. A parameter belongs
to its declaring type/enum, is visible throughout its field/payload type syntax,
and does not enter the global scope. Parameter names in different declarations
have distinct identities. Reject duplicate parameters within one declaration and
parameters named for primitive or prelude types. No additional global namespace
policy is selected by this rule.

Generic applications identify the declaration and all ordered type arguments.
Argument arity must match exactly. Nongeneric types cannot take arguments.
There are no defaults, omissions, partial applications, or raw/unapplied generic
concrete types in Slice 2A. Unknown argument types remain unresolved-name errors.

Substitute parameters recursively through fields, enum payloads, nested applications,
and nullable types. Generic arguments are invariant: `Box<Int>` is neither
`Box<Int?>` nor `Box<Float>`. Different declarations remain nominally distinct.
Types with identical substituted fields need not be the same instantiation.

For `type MaybeBox<T> { value: T? }`, both `MaybeBox<Int>` and
`MaybeBox<Int?>` have field type `Int?`, but retain distinct outer identities.
Nullable normalization applies to substituted nullable layers, not generic argument
identity. `Box<Int>?` and `Box<Int?>` also remain distinct. Written `T??`
is still rejected.

Finite nesting such as `Box<Box<Int>>` is valid. Follow stored field/payload
type dependencies to detect declaration cycles; revisiting the same declaration
on that dependency path is invalid regardless of its supplied arguments. This
rejects direct, mutual and transformed recursion, without treating repeated
names in finite use-site nesting as recursion.

Slice 2A permitted generic data descriptions in annotations, nongeneric function
signatures, fields, and payloads, and added no way to build a value of such a
type. [Slice 3A](#constructing-a-generic-value-slice-3a) adds construction. No
constraints or runtime generic representation strategy is selected; Q08 remains
unresolved.

## Constructing a generic value (Slice 3A)

Status: **ACCEPTED**, explicit human decision on 2026-09-21.
[ADR 0007](../decisions/0007-q11-type-boundaries.md) owns these semantics.

A generic value is built either by writing its type arguments, or by taking them
from an expected type. There is no third source.

### Explicit type arguments

```ko
Box<Int> { value: 42 }
Wrap<Int>.Has(42)
```

The written arguments are resolved as an ordinary type application: exact arity,
no defaults, no omissions, no partial application. **Explicit arguments are
authoritative.** They are not adjusted to satisfy the surrounding context; a
disagreement is an ordinary type mismatch:

```ko
fn wrong() -> Box<String> {
    Box<Int> { value: 42 }      // rejected: Box<Int> is not Box<String>
}
```

### Contextual construction

When no type arguments are written, they come from the expected type, and from
nothing else:

| Context | Example |
| --- | --- |
| Annotated binding | `annotated: Box<Int> = Box { value: 42 }` |
| Function final expression | `fn make() -> Box<Int> { Box { value: 42 } }` |
| Explicit return | `return Wrap.Has(42)` |
| Argument position | `consume(Box { value: 42 })` |
| Field or payload value | `Box<Box<Int>> { value: Box { value: 42 } }` |

The expected type must be an application of the very declaration being built.
An expectation naming a different declaration supplies nothing.

**Exactly one outer nullable wrapper is looked through.** The constructed value
itself stays non-nullable, and the ordinary non-null-into-nullable rule performs
the injection:

```ko
fn make() -> Box<Int>? {
    Box { value: 42 }           // builds Box<Int>, injected into Box<Int>?
}
```

Nothing else is inspected — not sibling branches, not later uses, not wrappers
of any other shape, and **not the field or payload values**:

```ko
value = Box { value: 42 }       // rejected: nothing says what T is
value = Wrap.Has(42)            // rejected: nothing says what T is
```

Koda does not infer a type argument from what a field or payload happens to
hold. There are no inference variables and no constraint solving.

### Substitution supplies the member types

Field and payload types come from ordinary substitution over the resolved
arguments, so contextual literal typing keeps working through them:

```ko
Box<Float> { value: 1 }         // 1 is a Float here
```

Construction is otherwise unchanged: every field exactly once, no unknown
fields, payload arity exact.

### Boundaries

Nesting is ordinary recursion, so an inner construction may be explicit or
contextual, at any finite depth. A substituted member type containing `Unit?`
remains outside the implemented subset, at construction exactly as at access.
Slice 3A added no generic functions; [Slice 4A](#generic-functions-slice-4a)
adds them. Neither adds inference, constraints, variance, or any runtime
representation of type arguments: generic values are fully erased.

## Generic functions (Slice 4A)

Status: **ACCEPTED**, explicit human decision on 2026-09-22.
[ADR 0007](../decisions/0007-q11-type-boundaries.md) owns the typing rules and
[ADR 0010](../decisions/0010-q04-result-obligations.md) the responsibility rule.

A function may declare unconstrained type parameters. They belong to that
function, are in scope throughout its parameter annotations, return annotation
and body, and do not escape it. Parameter names follow the rules data
declarations already use: non-empty, no duplicates, and no primitive or closed
prelude name.

### Type arguments are always written

```ko
identity<Int>(42)
```

A generic call supplies exactly the declared number of type arguments. Omitting
them is an error, never a request to infer:

```ko
identity(42)            // rejected: Koda does not infer type arguments
identity<>(42)          // rejected
identity<Int, String>(42)   // rejected
add<Int>(1, 2)          // rejected: 'add' is not generic
```

### The body is checked once

A generic body is checked a single time under its abstract type parameters. It
is never re-checked per call and never monomorphised.

Because an unconstrained `T` has no known capabilities, operations that need
one are rejected — without introducing constraints:

```ko
fn bad<T>(x: T) -> T { x + x }      // rejected: arithmetic needs Int or Float
```

Equality, ordering, field access and string interpolation are rejected on an
abstract `T` for the same reason.

### Calls substitute the signature

At a call, the written arguments substitute through the declared signature:
parameters are checked against the substituted types, and the call's type is
the substituted return type. Substitution recurses, so `Box<T>`,
`Result<Box<T>, E>`, `Pair<T, T?>` and `Box<Result<T, E>>` all behave as
ordinary applications once `T` is known.

A substituted expected type may then drive ordinary
[contextual construction](#contextual-construction):

```ko
fn consume<T>(box: Box<T>) -> Unit { ... }

consume<Int>(Box { value: 42 })     // expected Box<Int>, so Box's argument is known
```

This is the existing contextual rule reading a type the programmer wrote. It is
**not** generic-function inference.

### Nullable

`T?` is ordinary. Substituting a nullable argument flattens as always, so
`maybe<Int?>` produces `Int?` and never `T??`. A substitution that would produce
`Unit?` is rejected, exactly as that type is rejected anywhere else.

### Responsibility of an abstract type parameter

A generic body cannot see whether `T` is a `Result`, so Koda assumes it may be.

> A value whose type is an unconstrained type parameter carries an opaque
> responsibility. It may be returned, passed onward, or stored in a field or
> payload that preserves responsibility. It cannot be handled, because an
> abstract `T` cannot be matched.

```ko
fn identity<T>(x: T) -> T { x }         // accepted: handed on by the return

fn ignore<T>(x: T) -> Unit { }          // rejected: x is abandoned
```

`ignore` is rejected **at its declaration**, once, even though some
instantiations — `T = Int` — would carry nothing. That conservatism is
deliberate: without it, a two-line generic wrapper would let a `Result` be
discarded silently, which [ADR 0010](../decisions/0010-q04-result-obligations.md)
forbids.

Responsibility still flows only through **stored members**. `Phantom<T>` with no
fields carries nothing even at `Phantom<Result<Int, String>>`; `Box<T>` carries
its `value`. Enum payloads stay variant-sensitive: `Option.None` carries
nothing, `Option.Some(value: T)` carries `T`.

### Boundaries

Slice 4A adds no type-argument inference, no constraints or bounds, no variance,
no higher-kinded types, no first-class or partially applied generic functions,
and no runtime representation of type arguments.

## Lists (Slice 5)

Status: **ACCEPTED**, explicit human decision on 2026-09-22.
[ADR 0007](../decisions/0007-q11-type-boundaries.md) owns the typing rules and
[ADR 0010](../decisions/0010-q04-result-obligations.md) the responsibility rule.

`List<T>` is a prelude type: nominal, invariant, and applied with exactly one
type argument. It is an ordinary generic application in every respect the type
system cares about, so `List<Int>`, `List<Int?>`, `List<Result<Int, String>>`
and `List<List<Int>>` all behave as their shapes suggest. `List` is a closed
prelude name and cannot be redeclared or bound.

### A list is an immutable value

There is no element assignment, no in-place mutation, and no mutable alias.
`mut` continues to mean *rebind this name*, never *change this value*.

### Literals

```ko
[1, 2, 3]
["a", "b"]
[User { name: "Thandi" }, User { name: "Kagiso" }]
[[1, 2], [3, 4]]
```

Trailing commas and multiline forms are allowed. Elements are separated by
commas; a newline inside brackets is not a separator.

**An expected `List<T>` is authoritative** and supplies `T` to every element.
With no expectation, a non-empty literal takes its element type from its
**first** element and checks every later element against exactly that type.
There is no join, no widening between siblings, and no unification. Once the
element type is fixed, each element is checked against it by the ordinary
contextual rules, so ADR 0008's numeral retargeting still applies within a
list exactly as it does anywhere else:

```ko
[1, 2, 3]                       // List<Int>
[1, "a"]                        // rejected: the second element is not Int
[1, 2.5]                        // rejected: 2.5 cannot inhabit Int
values: List<Float> = [1, 2.5]  // accepted: the expectation reaches each element
```

### The empty list

`[]` has no element type of its own, exactly as bare `null` has no type. The
expected type supplies one, through the ordinary contextual contexts and one
outer nullable wrapper:

```ko
values: List<Int> = []          // accepted
values = []                     // rejected: nothing says what the elements are
```

### Reading a list

| Operation | Type | Behaviour |
| --- | --- | --- |
| `items.length()` | `Int` | how many elements |
| `items.isEmpty()` | `Bool` | whether there are none |
| `items.get(index)` | `T?` | the element, or `null` when the index is out of range |
| `items.append(value)` | `List<T>` | a **new** list ending with `value`; `items` is unchanged |

`get` treats every out-of-range index the same way, negative indexes included:
an index that names no element is an **absent value**, not a failed operation,
so it is `null` rather than a `Result`. There is no indexing syntax in v0.1.

### Building a list

```ko
numbers = [1, 2]
more = numbers.append(3)        // numbers is still [1, 2]; more is [1, 2, 3]
```

`append` is **persistent**: it returns a new list and never changes the one it
was called on. There is no mutating list operation, and `mut` continues to mean
*rebind this name*, so the accumulating form reads:

```ko
mut numbers: List<Int> = []
numbers = numbers.append(1)
numbers = numbers.append(2)
```

which also works inside a loop:

```ko
mut output: List<String> = []
for item in input {
    output = output.append(item)
}
```

`prepend`, `concat` and every other producer remain deferred.

### Iteration

```ko
for item in items {
    print(item)
}
```

`for` and `in` are reserved words. The iterable must be a `List<T>` and `item`
has type `T`. The binding is immutable, is visible only inside the body, and
may not shadow anything already in scope. A `for` is a statement and produces
no value. `if`, `match` and `return` work normally inside it, and loops nest.
An empty list runs the body zero times. `break` and `continue` are deferred.

### Responsibility of a list

A list has as many elements at runtime as it has, so responsibility is tracked
for **all of its elements collectively** rather than one path per element. A
finite literal and a list returned by a function use the same representation.
A list bears responsibility exactly when its element type does.

Three rules govern it:

- **Reading one element does not discharge the list.** `items.get(0)` renews a
  responsibility for the value it returns and leaves the list responsible for
  everything else. `length()` and `isEmpty()` look at no element at all and
  discharge nothing.
- **`append` accounts for what it reads.** It takes the list and the value and
  returns a new list carrying both, so the new list is responsible for
  everything the old one held. This is the ordinary rule that a read is
  accounted for and the destination renews — not ownership, and not a move.
  The original list stays perfectly readable, and reading it again renews a
  fresh responsibility that must be discharged in its own right:

  ```ko
  ys = xs.append(makeResult())
  for r in xs { handle(r) }     // fine - re-reading xs renews
  for r in ys { handle(r) }     // and ys must be handled too
  ```
- **Iterating to normal completion discharges the list**, because a loop visits
  every element. The body must discharge the loop binding on every path that
  reaches the end of the loop.
- **An early `return` discharges nothing.** Leaving the loop early proves
  nothing about the elements not yet visited, so the list is still outstanding
  on that path.

```ko
for result in results {
    match result {
        Ok(value) => ...
        Err(error) => ...
    }
}                                   // accepted: every element handled

for result in results {
    print("hello")
}                                   // rejected: result is ignored

for result in results {
    match result {
        Ok(value) => return value   // rejected: the rest were never visited
        Err(error) => { }
    }
}
```

Reading a list twice renews responsibility on each read, as every other repeated
read already does: responsibility is compiler accounting, not runtime identity,
so both loops must account for what they read.

## Structural Result responsibility (accepted Slice 3B)

[ADR 0010](../decisions/0010-q04-result-obligations.md#accepted-slice-3b-structural-responsibility-follow-up)
extends must-handle accounting through instantiated stored members. Independent
field/subtree responsibilities follow receiving locations, never runtime aliases.
Copying renews receiver responsibility even for already handled source fields;
transfer leaves values readable. Parameters/call results renew by type, without
effect summaries. Known enum alternatives, nullable stages, nested Ok/Err payloads,
wildcard residuals, temporary residuals and mutable generations are accounted for.
A path outstanding on any contributing execution path remains outstanding at a
join; skipped logical operands cannot transfer responsibility. This is local
accounting, not ownership or a global eventual-handling guarantee.
