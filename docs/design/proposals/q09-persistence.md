# Q09: Entities and persistence

State: **AWAITING DECISION**. Selected option: **none**. Every schema/API choice remains pending.
Depends on core semantics and Q10 cancellation/cleanup. Proposed executable support remains post-v0.1.

## Decision and why it matters

Choose entity identity/schema ownership, explicit connection binding, writes, queries, errors, transactions, concurrency control, and migrations. type remains ordinary data and entity persistent data. A short create expression cannot secretly choose a connection or save on field assignment.

## Alternatives

| Option | Persistence model | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Backend-neutral entity declaration with explicit repository/transaction capabilities and generated adapter signatures | Clear effects, testable dependencies, strong data distinction | More arguments/setup, needs code-generation/adapter contract |
| B | Entity declaration plus lexically bound persistence context; create uses that context | Compact idiom close to User.create { ... } | Context resolution is less visible and complicates nesting/async |
| C | Entity declaration is schema metadata; libraries expose explicit commands/queries without generated entity methods | Small core and flexible storage tools | More user/library boilerplate and weaker standardized ergonomics |

All forbid hidden writes and vendor/framework-specific grammar. C preserves entity rather than replacing it with ordinary type.

## Established languages and ecosystems

| Language | Approach |
| --- | --- |
| Rust | Diesel is a library/tooling ecosystem with schema/migration and explicit query execution; persistence is not Rust core grammar. [Diesel guide](https://diesel.rs/guides/getting-started.html) |
| Kotlin | Exposed supplies library transaction scopes; its convenience does not settle Koda's language-level connection model. [Exposed transactions](https://www.jetbrains.com/help/exposed/transactions.html) |
| Swift | SwiftData ModelContext owns model lifecycle and supports save/transaction behavior and autosave. Koda's explicit-write constraint excludes silently adopting autosave. [ModelContext](https://developer.apple.com/documentation/swiftdata/modelcontext) |
| TypeScript | Prisma ORM v7's documented transaction client demonstrates explicit transactional library calls, not TypeScript grammar. The version is stated because APIs change. [Prisma v7 transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions) |
| Go | database/sql uses Tx with explicit commit/rollback and transaction-bound operations. [Transactions](https://go.dev/doc/database/execute-transactions) |
| Python | sqlite3 exposes connection/transaction controls; the standard library, not grammar, owns database operations. [sqlite3](https://docs.python.org/3/library/sqlite3.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Visible dependencies, more setup | Easy short examples, context surprises | More concepts in libraries |
| AI-generated code | Connection/transaction arguments can be checked | Risk of using wrong ambient context | May invent adapter conventions |
| Compiler complexity | Schema/signature generation plus capabilities | Context resolution adds complexity | Smallest core, tooling carries work |
| Runtime performance | Explicit batching/loading can be optimized | Context plumbing small; hidden query risks need prohibition | Depends on library/adapter |
| Interoperability | Clear adapter protocol | Context propagation across foreign calls difficult | Most storage-library flexibility |
| Compatibility | Schema/adapter contract needs versioning | Context lookup semantics become sticky | Libraries evolve separately from grammar |

## Recommendation, not acceptance

Recommend **A**, with explicit ordinary function-call spelling first. Treat User.create { ... } as an intended explicit-write idiom, not a frozen requirement to omit connection arguments.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Connection | Explicit parameter: visible; bound repository: concise; lexical ambient: convenient | Explicit capability parameter or explicitly constructed repository; select one concrete API before freeze |
| Create spelling | User.create(db, input): ordinary; User.create(db) { ... }: new brace-call rule; bound receiver.create { ... }: compact/context setup | Ordinary call first, brace convenience later if justified |
| Identity | Generated ID: convenient; supplied ID: offline-friendly; selectable schema policy: flexible | Nominal ID with explicit per-entity supplied/generated policy; separate create-input and loaded-entity types |
| Schema metadata | Core annotations: visible/grammar cost; sidecar schema: separation/drift risk; adapter DSL: flexible | Backend-neutral field/type declaration plus explicit sidecar storage metadata, generated consistency checks |
| Queries | General SQL grammar: platform leakage; typed library builders: composable; named parameterized queries: simple | Named parameterized adapter queries first; no lazy field-access I/O |
| Write outcomes | Throw: hides signature; Result entity/count: explicit; status booleans: lossy | Result with distinct constraint/connectivity/conflict errors; create returns loaded entity |
| Null mapping | Implicit defaults: convenient/hidden; explicit nullable schema: predictable | Explicit nullable mapping and conversion failures |
| Transactions | Auto nesting: convenient/ambiguous; explicit savepoints: expressive; reject nesting: simple | Explicit transaction capability; reject nesting initially, explicit commit/rollback contract |
| Isolation/conflicts | Adapter defaults: simple/variable; declared isolation: visible; forced serializable: restrictive | Explicit declared isolation with unsupported-mode errors; version-based optimistic update/delete checks |
| Retry/migration | Automatic: convenient/hidden effects; explicit commands: reviewable | No implicit retries; reviewed migrations run only by explicit tooling, never imports/build/startup |

Before approval, define rollback on cancellation, commit failure, duplicate IDs, stale versions, missing rows, relationship loading, and database-specific capability rejection. Q10 must settle whether cancellation can interrupt commit and how uncertain commit outcomes are reported. No database code or schema migration is created here.
