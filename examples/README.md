# Koda example programs

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

These files are design examples, not runnable programs today. `core/` consistently uses the EXPERIMENTAL syntax proposal for ACCEPTED v0.1 feature directions. They have not passed a Koda compiler; none exists. Expected output is a future conformance target.

| Example | What it demonstrates | Expected output once implemented |
| --- | --- | --- |
| [hello.ko](core/hello.ko) | Entry function and explicit standard import | `Hello, Koda!` |
| [data-and-null.ko](core/data-and-null.ko) | Ordinary `type`, nominal records, `T?`, nullable match | `Ada`, then `Anonymous` |
| [results-and-enums.ko](core/results-and-enums.ko) | Associated data, explicit Result handling | `Hello, Ada`, then `Name is required` |
| [mutability-and-generics.ko](core/mutability-and-generics.ko) | Local inference, explicit mutation, generic function | `ready`, then `count updated` |
| [modules/main.ko](core/modules/main.ko) | Relative imports and explicit exports | `Hello, Koda` |
| [entities.ko](experimental/entities.ko) | Persistent schema/write design sketch | None; excluded from v0.1 |
| [structured-concurrency.ko](experimental/structured-concurrency.ko) | Scoped child-task design sketch | None; excluded from v0.1 |

Each core file is an independent entry program except `modules/greeting.ko`, which is imported by `modules/main.ko`. There is deliberately no pretend-working project manifest or execution command. When the project contract is frozen, package these as runnable fixtures.

`print` is proposed to accept a `String`, print it followed by a newline, and return `Unit`. String concatenation does not coerce values. Core examples avoid unresolved numeric edge cases and mutable record fields.

Experimental files intentionally reference undefined capabilities and proposed syntax. Their comments describe those assumptions; they must never enter a v0.1 positive compilation suite. See [persistence](../docs/spec/entities-and-persistence.md), [concurrency ADR](../docs/decisions/0006-structured-concurrency-direction.md), and [interop](../docs/spec/javascript-interop.md) for boundaries.
