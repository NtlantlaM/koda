# Entities and persistence

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** distinction and explicit-write principle; **EXPERIMENTAL** entity syntax and persistence API; executable support **LATER**, outside v0.1.

## Data versus persistence

[Q11 / ADR 0007](../decisions/0007-q11-type-boundaries.md) accepts nominal type identity and prohibits exposing reference/object identity. Entity identity/equality is explicitly deferred to this later persistence decision; nominal type identity does not itself define database-row identity or equality. Q09 remains AWAITING DECISION.

`type` represents ordinary application data with no automatic database identity, lifecycle, or I/O. Constructing it creates a value. `entity` represents a persistent database-backed model. Reading, constructing, copying, or changing a local value must never implicitly save it. Field assignment cannot be a database write.

```ko
type UserInput {
    name: String,
}

// EXPERIMENTAL: reserved future declaration, not accepted by v0.1.
entity User {
    id: UserId,
    name: String,
}

// EXPERIMENTAL: explicit I/O; returns a Result, never silently saves.
let outcome = User.create { name: "Ada" }
```

`User.create { ... }` is the intended explicit-write idiom. Its contextual brace-call spelling, generated-ID omission, connection source, asynchronous behavior, and return type require a future ADR. These braces are not ordinary record construction. The parser must not implement this example as a working feature in v0.1.

## Candidate behavioral contract

- Create, update, and delete operations are explicit and return typed failures.
- A loaded entity is a snapshot. Local values do not have an automatic save lifecycle or hidden lazy reads.
- Queries and relationship loading are explicit operations; merely accessing a field cannot trigger I/O.
- IDs are nominal types. Generated versus application-supplied identity must be declared in adapter/schema metadata, with the exact mechanism unresolved.
- Connection/transaction dependencies should be explicit capabilities rather than ambient globals. How the compact `User.create` idiom receives that capability remains unresolved.
- Transaction scopes must define commit, rollback, cancellation, and nested-transaction behavior. No automatic retry is assumed; retries can duplicate external effects.
- Constraint violations, connectivity errors, and concurrency conflicts need distinguishable failure values. Compiler typing cannot prove that a database is reachable or a write will satisfy live constraints.

## Architecture boundary

The language may eventually recognize a backend-neutral entity declaration. Adapters and libraries own storage engines, SQL generation, connection pools, query plans, and serialization. A separate migration tool must produce reviewable migrations. Importing a module, compiling a program, or starting a server must not mutate a schema.

Credentials and connection strings belong to runtime configuration, never grammar or generated source. Authentication, authorization, tenancy, and framework models are application/library responsibilities; `entity` does not imply authorization.

Before implementation, decide identity, schema metadata, explicit connection binding, query representation, write return types, null mapping, optimistic concurrency, transaction isolation, and migration ownership. See Q09 and ADR 0003. The example in `examples/experimental` is a discussion artifact, not a database integration test.

## Accepted future numeric adapter constraints

[Q02 S14 / ADR 0008](../decisions/0008-q02-numeric-semantics.md) accepts explicit metadata/codecs with range and representation checks; implementation is deferred until persistence. Follow the [numeric persistence contract](numbers.md#future-persistence-contract-s14): exact signed-64-bit transport, checked narrower writes, no trust in unsafe Number driver outputs, declared Float preservation capabilities, and no automatic database DECIMAL/NUMERIC-to-Float conversion. Decimal remains reserved and unusable in v0.1. SQL expression/aggregate/nullability and round-trip contracts remain future adapter work. Q09's schema/API and entity identity/equality decisions remain AWAITING DECISION.
