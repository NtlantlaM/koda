# Language specification

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** principles and semantic direction; linked experimental proposals are not frozen.

## Purpose

Koda is a real programming language for production software built by people, optionally assisted by AI. Programs must be understandable, buildable, testable, and maintainable without AI services. The compiler decides whether a program satisfies the language's static rules. It cannot guarantee business correctness or external-system reliability.

The language favors readability, strong typing with inference, explicit effects, and useful diagnostics over compactness or feature count. A feature needs a concrete use case that cannot be served clearly by existing constructs or libraries.

## Core model

- Source is UTF-8 in `.ko` files. Modules contain declarations; functions contain executable statements and expressions.
- Bindings are immutable unless declared with `mut`. Nullable values use `T?` and must be checked before use.
- Ordinary data uses `type`; alternatives use `enum`, including variants with associated data.
- Recoverable failure is returned as `Result<T, E>` and handled explicitly. Pattern matching checks all alternatives.
- Traits and composition are the preferred future reuse mechanism. Deep inheritance is excluded.
- Persistent data uses `entity`, with explicit database operations. Persistence is outside the v0.1 executable subset.
- Future concurrent work must belong to a structured lifetime. Detached tasks are not part of the accepted direction.

## Execution direction

The initial target is Node.js. Expressions evaluate left to right; function arguments are evaluated before the call. There are no implicit numeric/string/boolean coercions. `Bool` is required in conditions. A well-typed ordinary data program must not depend on JavaScript's object property coercion or truthiness rules.

v0.1 is synchronous. The entry module exports `main` with no parameters and a `Unit` return. Runtime entry failures produce a diagnostic and nonzero process exit; the CLI must not report success after a fatal failure. Recoverable application failures remain values. The precise exit-code contract is Q07.

Function calls are permitted as expression statements, except that a `Result` cannot be silently discarded. I/O is not claimed to be pure. v0.1 does not introduce a general effect system.

## Core versus libraries

Core syntax covers data, functions, control flow, modules, and types. Framework-specific routing, HTTP handlers, UI components, cloud resources, and deployment descriptions are library or external-tool concerns. Standard library names such as `print` are ordinary imported functions, not reserved grammar.

`entity` is a proposed general persistent-data declaration boundary, not permission to add SQL dialects, vendor names, credentials, migrations, or web framework constructs to the grammar. Its executable design remains experimental.

## Versioning

v0.1 will be a deliberately small, specified implementation milestone, not a production-readiness claim. Before release, publish its exact supported subset, platform versions, limitations, and conformance results. Later features must not acquire accidental compatibility guarantees through these sketches.
