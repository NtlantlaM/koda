# Koda projects and modules

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** one toolchain and `.ko` source files. Module/import/export rules, manifest, and command contracts are **EXPERIMENTAL / AWAITING DECISION**, pending Q01, Q05, and Q07.

## Proposed application layout

```text
my-app/
  koda.toml          Project manifest
  koda.lock         Resolved dependencies and integrity information
  src/
    main.ko         Entry module
    greeting.ko     Local module
  tests/
    greeting.ko     Test modules
  dist/             Generated JavaScript and source maps
  .koda/            Disposable toolchain cache
```

Candidate manifest, not currently consumed by any tool:

```toml
[package]
name = "hello-koda"
version = "0.1.0"

[toolchain]
language = "0.1"

[build]
entry = "src/main.ko"
target = "node"
out-dir = "dist"
```

Toolchain/language compatibility, Node version constraints, manifest validation, and lockfile schema must be decided before this becomes a supported format. No dependency or package-manager behavior is implied by this illustrative manifest.

## Module proposal

One file is one module. Declarations are private unless marked `export`. Relative imports name an explicit `.ko` file; no implicit index file lookup. Names from another module must be explicitly imported. `koda:` identifies standard library modules. npm dependencies use a separate `npm:` namespace at the foreign boundary, not ordinary unchecked Koda imports.

```ko
import { greeting } from "./greeting.ko"
import { print } from "koda:io"

export fn main() -> Unit {
    print(greeting("Koda"))
}
```

Proposed v0.1 restrictions: no executable top-level statements, no module cycles, no wildcard exports, and no import escape outside declared package roots. Paths use exact case across platforms; the resolver must diagnose mismatches even on case-insensitive filesystems. Symlink and package-root resolution rules are Q05. Entry `main` is invoked by the generated launcher, never as an import side effect.

## Relationship to compiler slice 0

[Compiler slice 0](../implementation/slice-0.md) accepts exactly one import,
`import { print } from "koda:io"`, and one entry form, an exported `main`.
Neither settles anything in this document. `print` is a **compiler and runtime
intrinsic** that the slice exposes through a provisional import spelling so that
a program can produce output at all; the slice resolves no file, has no module
graph, and implements no manifest. Module resolution, export visibility, the
`koda:` namespace, the entry contract's tooling surface and the manifest remain
**AWAITING DECISION** under Q05 and Q07, and may replace that spelling outright.

## Single toolchain surface

All commands below are proposed, not available:

| Command | Intended responsibility |
| --- | --- |
| `koda check` | Parse, resolve, and type-check without executable output |
| `koda build` | Check then emit JavaScript/source maps |
| `koda run` | Build and run the configured Node entry |
| `koda fmt` / `koda fmt --check` | One canonical format; verify without edits |
| `koda test` | Discover and run tests using the same compiler |
| `koda add` / `koda install` | Resolve dependencies and maintain one lockfile |

v0.1 targets local package management and the smallest viable npm dependency subset. Remote Koda registry publishing is LATER. The package manager is part of the Koda CLI even if it delegates npm transport; no second independent lockfile authority should be required. Backend selection and reproducibility requirements are Q05/Q06.

The formatter owns layout, not semantics, and must preserve comments. Test declarations should use ordinary exported functions and test-library conventions rather than a new framework grammar. Candidate convention: exported zero-argument `test_` functions returning `Unit` under `tests/`, with assertion failures reported by the runner. Q07 must freeze discovery, isolation, reporting, and failure behavior.
