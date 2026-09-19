# Q05: Projects, modules, and locked dependencies

State: **AWAITING DECISION**. Selected option: **none**. All format/path/version choices remain pending.
Depends on Q01; coordinate the installation contract with Q06.

## Decision and why it matters

Choose module identity and visibility, the manifest/lockfile, local dependency boundaries, cycles, symlinks/case, and host version policy. Reproducible projects must mean the same thing on Windows, Linux, CI, and an AI agent's machine.

## Alternatives

| Option | Model | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | One file/module, explicit .ko paths, declarative TOML, one authoritative Koda lock | Predictable resolution, no executable manifest | More explicit paths and dependency translation work |
| B | Logical package modules spanning files, declarative manifest and lock | Moves within a package need fewer import changes | More package scope/collision rules; less obvious source origin |
| C | Koda manifest plus delegated npm package/lock authority for the JS dependency graph | Reuses npm resolution faithfully | Two visible dependency domains; more cross-manifest consistency rules |

C can still use one Koda CLI; one tool does not necessarily imply one file.

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Cargo uses Cargo.toml for package/dependency/tool metadata. [Manifest](https://doc.rust-lang.org/cargo/reference/manifest.html) |
| Kotlin | Package names need not match directory structure; imports select names, while build tools manage dependencies. [Packages](https://kotlinlang.org/docs/packages.html) |
| Swift | SwiftPM uses a Swift Package.swift manifest and target/product/dependency declarations. [PackageDescription](https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html) |
| TypeScript | Module resolution is configured to match a runtime/bundler; path aliases do not inherently rewrite emitted imports. [Modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html) |
| Go | Modules use go.mod and versioned requirements; go.sum records checksums, not a conventional frozen dependency lockfile. [Modules](https://go.dev/ref/mod) |
| Python | pyproject.toml is declarative project/build-tool metadata; build-backend choice remains explicit. [Packaging guide](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | File paths easy to follow | Fewer imports, package scope less visible | Familiar to npm users, two domains to learn |
| AI-generated code | Exact paths/names easy to validate | May invent cross-file implicit names | Existing npm conventions help, configuration can drift |
| Compiler complexity | Small deterministic resolver | Package aggregation/collision checks | Simpler npm graph ownership, harder integration |
| Runtime performance | Little inherent difference | Little inherent difference | Install behavior differs, not core arithmetic |
| Interoperability | Needs a faithful npm lock bridge | Depends on chosen foreign package policy | Strong direct npm ecosystem fit |
| Compatibility | Paths/lock schema become public contracts | Package identity becomes hard to change | Delegated file schemas/tool versions constrain upgrades |

## Recommendation, not acceptance

Recommend **A**, provided Q06 specifies a lossless npm lock representation. If that cannot be kept simple, choose C openly instead of pretending two independent locks are one authority.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Manifest | TOML: readable; JSON: ubiquitous/no comments; executable code: powerful/non-deterministic | TOML, schema version, unknown-key diagnostics |
| npm resolution storage | Embed canonical npm lock section: one authority; companion npm lock: familiar; custom graph resolver: high cost | Canonical delegated lock payload inside Koda lock, deterministic transient projection; Q06 must validate feasibility |
| Module cycles | Reject: clear/small; permit type-only: useful/extra graph rules; general cycles: init complexity | Reject cycles initially, no executable top-level statements |
| Visibility | Explicit exports: clear; naming convention: terse; package-public default: broad | Private by default, explicit exports/imports, no wildcard exports initially |
| Local packages | Explicit manifest paths: reproducible; workspace auto-discovery: convenient; arbitrary filesystem imports: unsafe ambiguity | Declared package roots and dependencies |
| Case/symlinks | Lexical-only paths: easy; canonical real paths: stable; ban symlinks: restrictive | Canonicalize, require exact case, allow symlinks only to declared roots, reject undeclared escapes |
| Lock updates | Automatic on build: convenient/network; explicit install/add: predictable | Build/check consume installed locked inputs; only package commands resolve/update |
| Version policy | Floating latest: easy/drift; exact pins: reproducible; supported range plus exact CI pins: flexible | Record supported Node LTS major range and exact development versions before implementation; no unverified version number chosen now |

Before approval, define missing/cyclic imports, case mismatch, a linked local dependency, stale lock behavior, and offline check. No manifest or package manager is implemented by this proposal.
