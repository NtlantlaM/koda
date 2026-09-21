# Compiler slice 1A — user-defined data

> **This document records an implementation, not a decision.** Nothing here
> changes a feature's maturity or any question's decision state. Accepted
> language behaviour and provisional implementation choices are kept in separate
> sections on purpose.

[Slice 1B](slice-1b.md) builds on this one by adding `match`.

Slice 1A adds the first user-defined data to [slice 0](slice-0.md): `type`
declarations, record construction, field access, `enum` declarations, variants
and payloads. Every phase of the pipeline was extended — there is no source
rewriting and no emitter-only shortcut.

```text
.ko source
  -> lexer            (unchanged; `.` and braces were already tokens)
  -> parser           + type/enum declarations, record literals, member access
  -> AST              + TypeDecl, EnumDecl, RecordExpression, MemberExpression
  -> resolver/checker + nominal declarations, three new passes, member checking
  -> typed IR         + IRRecordConstruct, IRFieldAccess, IRVariantConstruct
  -> JavaScript       + object literals and a tag property
  -> runtime          (unchanged)
```

## Accepted language behaviour

Each rule below is required by an accepted ADR or specification.

### Nominal identity (ADR 0007)

A record or enum type carries its **declaration**, not its shape. Two
declarations with identical fields are different types, and no structural
compatibility exists between them:

```ko
type User    { name: String, age: Int }
type Visitor { name: String, age: Int }   // a different type
```

Passing a `Visitor` where a `User` is expected is `KODA-T0001`.

### Construction supplies every field exactly once

docs/spec/type-system.md requires construction to supply every field exactly
once and to reject unknown fields. A missing field is `KODA-T0008`, an unknown
one `KODA-T0009`, and a repeated one `KODA-N0002`.

```ko
user = User {
    name: "Killo"
    age: 30
}
```

Fields are separated by a line break or a comma, in multiline or compact form,
with a trailing separator allowed (ADR 0011).

### Record literals are restricted in control heads (ADR 0011)

`if ready {` opens a block, never a construction. The parser suppresses the
literal form inside a control head rather than consulting the type table, and
parentheses bring it back:

```ko
if (Settings { debug: true }).debug {
    ...
}
```

### Enum variants are qualified, and payloads are declared with names

```ko
enum PaymentStatus {
    Pending
    Paid(transactionId: String)
    Failed(reason: String)
}
```

A variant with a payload must be given its values; one without must not be.
Arity problems are `KODA-T0006`, payload type problems `KODA-T0001`, and an
unknown variant `KODA-T0009`.

### Ordinary values are immutable (ADR 0009)

There is no field assignment. `user.name = "Other"` is rejected with
`KODA-T0004` and an explanation that `mut` rebinds a binding but never changes a
field. Assignment through a `mut` binding and through a nested path are rejected
the same way. Aliases stay independent, which the execution fixture checks: after
`current` is rebound, `user` still holds its original value.

### Recursive data types are rejected (ADR 0007)

ADR 0007 defers recursive user-defined data types, so a cycle through fields or
payloads is `KODA-U0001` and names the chain:

```text
error[KODA-U0001]: 'Left' contains itself
note: the chain is Left -> Right -> Left, through right, left
note: recursive data types are an accepted deferral (ADR 0007) and are not available yet
```

Direct self-reference, mutual recursion between records, and recursion through
an enum payload are all detected.

### Derived equality is deferred (ADR 0007)

`==` on a record or enum is rejected; ADR 0007 defers derived equality for
user-defined value types.

### Interpolation of user-defined values is rejected

ADR 0008 fixes numeric interpolation text and leaves other conversions to be
specified, so a record or enum inside a string is `KODA-U0001`.

### Evaluation order

Record fields evaluate in **source** order, not declaration order, because
docs/spec/language.md requires left-to-right evaluation. In
`User { age: f(), name: g() }` the call `f()` runs first. The IR keeps entries
in source order for exactly this reason.

## Provisional implementation choices

None of these is an accepted decision. Each names the question that owns it.

| Choice | Made here | Owner |
| --- | --- | --- |
| A record is a JavaScript object whose keys are the field names under a `k_` prefix | The prefix keeps a Koda field named `__proto__` or `constructor` from meaning anything to JavaScript. | **Q08** |
| An enum value is an object with a `$tag` string property plus its payload under the same prefix | A Koda identifier cannot contain `$`, so the tag can never collide with a payload name. | **Q08** |
| Values are not `Object.freeze`d | ADR 0009 item 15 makes deep immutability an observable guarantee, not a mandate to freeze. Nothing in this slice can mutate a value, so the guarantee holds statically. | **Q08** |
| One module-level namespace for types, enums and functions | **Namespace separation remains unspecified.** ADR 0011 lists separate type/value namespaces only as a recommended candidate and does not settle it, so `type User` alongside `fn User()` is rejected. Reviewed 2026-09-21 and deliberately **kept provisional**, not ratified. Rejecting is the conservative direction: a separate-namespace rule can be adopted later without invalidating any program that compiles today. | **Q01** |
| `export` on a `type` or `enum` parses and is recorded, but has no effect | Nothing is importable while Q05 is unresolved. | **Q05** |
| `KODA-T0008` (incomplete record) and `KODA-T0009` (unknown member) | docs/spec/diagnostics.md states its code table is a candidate list. Both are marked `CANDIDATE` in `codes.ts`. | **Q07** |

Everything provisional in [slice 0](slice-0.md#provisional-choices) remains so.

## Settled after review

The slice-1A review resolved the payload question it raised. Both points below
are now **accepted language behaviour**, recorded in
[syntax](../spec/syntax.md#enum-payloads-named-declaration-positional-construction)
and under "Accepted follow-up details" in
[ADR 0011](../decisions/0011-q01-concrete-syntax.md) (2026-09-21):

- **A payload is declared with named fields and constructed positionally.** The
  declared name documents and identifies the field; it is not an argument label,
  and no named or labelled argument form exists for any call. The compiler's
  behaviour was already this, so nothing in the implementation changed beyond
  the wording of the diagnostic for the labelled form.
- **A payload pattern binds fresh names**, which need not match the declared
  field name — `PaymentStatus.Paid(id)`. That direction is fixed; the rest of
  pattern syntax belongs to the work that introduces `match`.

The stale positional payload declarations were corrected at the same time, in
docs/spec/syntax.md's grammar sketch and in
`examples/core/results-and-enums.ko`.

## Ambiguity found, and not resolved here

**What are the payload field names of the prelude `Result`?**

docs/spec/type-system.md sketches the prelude as `Ok(T)` / `Err(E)`, which
predates the accepted named-declaration rule. Correcting it the way the other
examples were corrected would mean inventing names for `Ok` and `Err`, and
ADR 0008 explicitly leaves "Q04/Q06 error names, payloads and boundary wrapping"
as remaining integration work.

The sketch was therefore left as it stands, with a note recording why. Nothing
depends on the answer yet: construction is positional, so `Ok(value)` reads the
same whatever the field is eventually called. This slice does not implement
`Result` at all.

## Not implemented

Everything excluded from slice 0 stays excluded, and slice 1A adds nothing from
the later list. In particular there is still no `match`, so an enum value can be
built, bound, passed and returned, but its payload cannot be read back. That is
the intended boundary for this slice, not an oversight.

Known rough edge: an explicit generic call, `parse<Int>("42")`, reads as a chain
of comparisons and produces a confusing diagnostic. Distinguishing it needs the
bounded lookahead ADR 0011 requires, which belongs with generics themselves.
Generic *declarations* are diagnosed clearly.

## Diagnostics added

| Code | Condition |
| --- | --- |
| `KODA-T0008` *(candidate)* | a record construction does not supply every field |
| `KODA-T0009` *(candidate)* | a type has no such field, or an enum no such variant |
| `KODA-N0002` | a field, variant or payload value is declared twice |
| `KODA-T0004` | assignment to a field |
| `KODA-T0006` | a variant payload has the wrong number of values |
| `KODA-T0001` | nominal mismatch, wrong field or payload type, a type used as a value, a record called like a function, an enum built with braces |
| `KODA-U0001` | recursive data, generic declarations, interpolating a user-defined value |
| `KODA-P0001` | positional payload declaration, labelled call argument, missing separator |

## Fixtures

| File | Covers |
| --- | --- |
| `tests/execution/records-and-enums.ko` | construction, field access, nested access, compact and multiline forms, rebinding, alias independence, source-order evaluation |
| `tests/syntax/data-declarations.ko` | separator forms, control-head restriction, parenthesised literal |
| `tests/syntax/data-forms-rejected.ko` | positional payload declaration, generic declarations, missing separator, labelled argument |
| `tests/types/records.ko` | missing, unknown, misspelled, duplicate and mistyped fields; nominal distinction; type as value; record called |
| `tests/types/enums.ko` | duplicate variants and payload names, unknown variant, payload arity and types, nominal distinction, no fields, no equality |
| `tests/types/data-immutability.ko` | field assignment, nested field assignment, rebinding to another type |
| `tests/types/recursive-data.ko` | direct, mutual and payload recursion; a non-cyclic reference still accepted |

## Running it

```bash
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/records-and-enums.ko
```
