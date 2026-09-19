# Koda

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Koda is a standalone, open-source programming language for humans and AI to build production software together. AI assistance is optional; the compiler is the authority on correctness.

Koda source files use `.ko`. The initial compiler will be written in TypeScript and target JavaScript running on Node.js. TypeScript is an implementation choice, not Koda's language definition.

**Repository stage: language design.** This repository contains specifications, architecture proposals, decision records, and illustrative programs. There is no compiler, runtime, CLI, or working package manager yet. Examples are not executable or compiler-validated.

## Start here

- [Documentation index](docs/README.md)
- [Language principles and scope](docs/spec/language.md)
- [Feature status register](docs/design/feature-status.md)
- [Ordered decision proposals — all AWAITING DECISION](docs/design/open-questions.md)
- [Complete specification review and repository verification](docs/design/specification-review.md)
- [Staged v0.1 roadmap](docs/roadmap.md)
- [Example programs](examples/README.md)

## Repository map

```text
docs/
  spec/                  Language, syntax, types, diagnostics, persistence,
                         project structure, and JavaScript/npm interop
  architecture/          Compiler pipeline and future toolchain boundaries
  design/                Feature statuses and unresolved design questions
  decisions/             Architecture decision records (ADRs)
  roadmap.md             Delivery stages and exit criteria
examples/
  core/                  Proposed v0.1 syntax
  experimental/          Persistence and concurrency design sketches
packages/                Future TypeScript package layout; documentation only
tests/                   Future conformance strategy; documentation only
```

Contribute through [the design contribution guide](CONTRIBUTING.md). No implementation or installation commands are available yet.
