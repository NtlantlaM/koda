# Koda

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Koda is a standalone, open-source programming language for humans and AI to build production software together. AI assistance is optional; the compiler is the authority on correctness.

Koda source files use `.ko`. The initial compiler will be written in TypeScript and target JavaScript running on Node.js. TypeScript is an implementation choice, not Koda's language definition.

**Repository stage: language design, plus a first executable compiler slice.**
The specifications, architecture proposals and decision records remain the
source of truth. Alongside them, [compiler slice 0](docs/implementation/slice-0.md)
compiles a single-module subset of the accepted language to JavaScript and runs
it on Node.

The slices are small on purpose. They implement only constructs governed by
already-accepted decisions, and report every other construct as an explicit
unsupported-feature diagnostic, so that building them did not answer any open
question by accident. [Slice 1A](docs/implementation/slice-1a.md) adds `type`
declarations, record construction, field access, and `enum` declarations with
variants and payloads; [slice 1B](docs/implementation/slice-1b.md) adds
`match` over enums, with payload patterns and exhaustiveness checking; and
[slice 1C](docs/implementation/slice-1c.md) adds nullable types, `null`,
nullable matching and refinement by an explicit null check. [Slice 2A](docs/implementation/slice-2a.md)
adds generic data declarations and type applications, and
[slice 2B](docs/implementation/slice-2b.md) adds `Result<T, E>` values,
constructors and matching, and
[slice 2C](docs/implementation/slice-2c.md) enforces Result's must-handle rule:
a Result may not be discarded, abandoned at a scope exit or overwritten before
someone has looked at it. [Slice 3A](docs/implementation/slice-3a.md) adds
generic value construction, explicit and contextual, so a user-defined generic
type can finally hold a value. [Slice 3B](docs/implementation/slice-3b.md) adds structural Result responsibility, receiver renewal and conditional payload tracking. [Slice 4A](docs/implementation/slice-4a.md)
adds explicit generic functions and explicit generic calls, with type arguments
always written. [Slice 5](docs/implementation/slice-5.md) adds an immutable
`List<T>` with literals, `get`/`length`/`isEmpty` and `for` iteration.
Type-argument inference, list producers such as `append`, recursive data,
multi-module programs and npm
interop are **not** implemented. There
is no formatter, test runner or package manager. Some `examples/` programs use
constructs the slices do not cover; `examples/README.md` says which ones run.

## Start here

- [Documentation index](docs/README.md)
- [Language principles and scope](docs/spec/language.md)
- [Feature status register](docs/design/feature-status.md)
- [Ordered decisions — Q01, Q02, Q03, Q04 and Q11 ACCEPTED; Q05–Q10 and Q12–Q13 AWAITING DECISION](docs/design/open-questions.md)
- [Complete specification review and repository verification](docs/design/specification-review.md)
- [Staged v0.1 roadmap](docs/roadmap.md)
- [Example programs](examples/README.md)
- [Compiler slice 0 - the first executable slice](docs/implementation/slice-0.md)
- [Compiler slice 1A - user-defined data](docs/implementation/slice-1a.md)
- [Compiler slice 1B - match and enum patterns](docs/implementation/slice-1b.md)
- [Compiler slice 1C - nullability](docs/implementation/slice-1c.md)
- [Compiler slice 2A - generic data-type foundations](docs/implementation/slice-2a.md)
- [Compiler slice 2B - Result values and matching](docs/implementation/slice-2b.md)
- [Compiler slice 2C - Result must-handle analysis](docs/implementation/slice-2c.md)
- [Compiler slice 3A - generic value construction](docs/implementation/slice-3a.md)

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
packages/
  compiler/              Sources, diagnostics, lexer, parser, checker, IR, emitter
  runtime/               Minimal support for generated programs
  cli/                   The single koda command
tests/                   Conformance fixtures for the implemented subset
```

## Try the slice

```bash
npm install
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/hello.ko
```

Contribute through [the design contribution guide](CONTRIBUTING.md). There is no
installable release, and the command surface above is provisional pending Q05
and Q07.

Structural Result tracking is implemented in [Slice 3B](docs/implementation/slice-3b.md):
local responsibility through containers, with receiver renewal and no ownership.
