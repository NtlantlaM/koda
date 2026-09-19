# Q07: Tool contracts, diagnostics, tests, and entry points

State: **AWAITING DECISION**. Selected option: **none**. All commands, codes, and formats are candidates.
Depends on Q01, Q04–Q06, Q08.

## Decision and why it matters

Choose entry/test conventions, CLI command outcomes, machine/human streams, span encoding, and canonical formatting. One toolchain is accepted; its protocol is not. Automation and AI tools need parseable output that means the same thing as terminal diagnostics.

## Alternatives

| Option | Tooling policy | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Explicit main, convention-discovered ordinary tests, fixed formatter, versioned structured events | Small grammar, deterministic automation | Naming conventions and event schema must be learned |
| B | Main returns an exit/result type; tests use explicit metadata or registration; structured reports | Rich application exits and flexible tests | More types/registration/metadata surface |
| C | Script-style top-level entry and assertion discovery, human output first | Quick beginner experiments | Import side effects; ambiguous discovery; machine clients need later protocol work |

C still eventually needs structured diagnostics to satisfy the brief, but delaying them increases migration cost.

## Established languages

| Language | Approach |
| --- | --- |
| Rust | rustc provides structured JSON diagnostics including spans and child messages. [JSON output](https://doc.rust-lang.org/rustc/json.html) |
| Kotlin | Its command-line compiler exposes explicit compilation/run tooling; it does not establish Koda's desired all-in-one conventions. [CLI](https://kotlinlang.org/docs/command-line.html) |
| Swift | SwiftPM organizes package targets and test targets; project tooling can own testing without framework grammar in every source construct. [PackageDescription](https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html) |
| TypeScript | Compiler flags configure diagnostic/emit behavior; test execution and formatting are separate ecosystem concerns. [TSConfig](https://www.typescriptlang.org/tsconfig/) |
| Go | The go tool integrates build/run/test/fmt commands and documented test conventions. [go command](https://pkg.go.dev/cmd/go) |
| Python | unittest supports named test cases and discovery, separate from Python's core grammar. [unittest](https://docs.python.org/3/library/unittest.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | One predictable path | More setup, richer control | Easiest first script, surprising imports |
| AI-generated code | Stable protocols and repairable codes | More metadata/entry obligations | Easy scripts, fragile output parsing |
| Compiler complexity | Tools share compiler; modest runner | More entry types/registration rules | Easy entry, later migration/recovery costs |
| Runtime performance | Test-process isolation costs startup | Depends on runner policy | Top-level import work can add hidden cost |
| Interoperability | Machine schema/editor mapping explicit | Rich integrations, more protocol fields | Human output not a reliable API |
| Compatibility | Version schema/codes independently | Larger early API commitment | Adding a protocol later disrupts consumers |

## Recommendation, not acceptance

Recommend **A**, with entry/test behavior chosen independently from diagnostic transport. All choices are **AWAITING DECISION**:

| Subchoice | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Entry | main -> Unit: small; main -> Result: expressive; top-level script: quick | Exported zero-argument main -> Unit; application handles recoverable failures explicitly |
| Tests | test_ function convention: simple; metadata: flexible; registry: explicit/boilerplate | Exported zero-argument test_ functions in tests/, returning Unit; assertions fail through runner-controlled fatal test outcome |
| Isolation | Same process: fast/state leaks; process/module: balanced; process/test: clean/slow | Process per test module initially; document shared state within a module |
| No tests | Success: convenient; warning: visible; error: prevents empty CI success | Error unless an explicit allow-empty option is chosen |
| Machine transport | One JSON document: easy/small jobs; NDJSON events: streaming; JSON diagnostics plus raw child output: mixed/fragile | Versioned NDJSON events; diagnostics, child stdout/stderr, and final outcome typed separately |
| Streams | Mixed output: simple/fragile; clean machine stdout: reliable; dedicated output file: extra setup | In JSON mode stdout only structured events; child output encoded as events; human progress on stderr |
| Spans | UTF-8 offsets: source-precise; UTF-16: editor-friendly; scalar positions: intuitive | Half-open UTF-8 byte offsets, one-based human lines/scalar columns, explicit editor UTF-16 conversion |
| Exit codes | One failure code: simple; categorized codes: automation; child passthrough: conventional/collisions | Tool success 0; build/check/test failure 1; invocation/config failure 2; internal failure 70. run forwards child status after successful build; structured phase distinguishes collisions |
| Formatting | Fixed four spaces: one style; fixed two: compact; configurable: fragments style | Four spaces, LF, trailing commas for multiline lists, no semantic rewriting |
| Warning policy | Always fatal: strict; never fatal: fixed; opt-in deny warnings: flexible | Errors always block emission; opt-in warning promotion; stable codes, wording may improve |

The baseline diagnostic code list is provisional, not already stable. Freeze its initial registry and JSON schema only after approval. Before closing, specify failed check/build, assertion failure, crash, child output in JSON mode, emoji spans, suggested edit applicability, and formatter idempotence. No tools are implemented here.
