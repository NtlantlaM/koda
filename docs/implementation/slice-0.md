# Compiler slice 0

> **This document records an implementation, not a decision.** Nothing here
> changes a feature's maturity or any question's decision state. Where the slice
> had to pick a behaviour that no accepted decision fixes, it is listed under
> [Provisional choices](#provisional-choices) and must be revisited when the
> owning question is resolved.
>
> Slice 0 is the base. [Slice 1A](slice-1a.md) adds user-defined data on top of
> it; the boundaries below describe slice 0 as it was built, and 1A's document
> records what has since moved into the language.

Slice 0 is the smallest executable path through the pipeline in
[compiler architecture](../architecture/compiler.md): source text in, a running
Node program out, with real diagnostics at every phase.

```text
.ko source
  -> source manager (UTF-8 spans, line map)
  -> lexer (significant newlines, interpolation, exact numerals)
  -> recursive-descent + Pratt parser
  -> resolver and type checker
  -> typed IR
  -> JavaScript ES module + launcher + runtime
  -> node
```

## Scope boundary

The slice implements accepted rules from
[ADR 0007](../decisions/0007-q11-type-boundaries.md),
[ADR 0008](../decisions/0008-q02-numeric-semantics.md),
[ADR 0009](../decisions/0009-q03-mutation-and-aliasing.md),
[ADR 0010](../decisions/0010-q04-result-obligations.md) and
[ADR 0011](../decisions/0011-q01-concrete-syntax.md).

It deliberately implements **no** construct whose behaviour would require
choosing an answer to Q05, Q06, Q07 or Q08, all of which remain
**AWAITING DECISION**. Every excluded construct produces `KODA-U0001` naming the
reason, rather than a guess.

### Implemented

| Area | What works |
| --- | --- |
| Declarations | `fn` with explicit parameter and return types, `export`, ordinary recursion |
| Entry | `export fn main() -> Unit`, invoked by a generated launcher |
| Imports | `import { print } from "koda:io"` only |
| Types | `Bool`, `String`, `Int`, `Float`, `Unit` |
| Bindings | `name = value` (immutable), `mut name = value` (rebindable), optional `: Type` |
| Control flow | `if` / `else if` / `else` as statement and as value, `return`, block tail values |
| Operators | the full precedence table: unary `!` and `-`, `* / %`, `+ -`, `< <= > >=`, `== !=`, `&&`, `||` |
| Numbers | checked signed 64-bit `Int`, binary64 `Float`, decimal/binary/octal/hex integers, `_` separators, decimal-point and exponent forms, contextual literal typing |
| Strings | double quotes, escapes, `{expression}` interpolation |
| Comments | `//` and non-nesting `/* ... */` |
| Diagnostics | stable codes, UTF-8 spans, notes, suggested edits, human and JSON rendering |
| Tools | `koda check`, `koda build`, `koda run` |

### Not implemented, and why

| Construct | Reason |
| --- | --- |
| `type` records, `enum`, `match` | Accepted v0.1 features, excluded to keep this slice minimal. They need no new decision, only work. |
| `T?` and `null` | Accepted (ADR 0007), but using them safely requires `match`. |
| `Result`, `Ok`, `Err` | Need enums and generics. ADR 0010's must-handle rule therefore has nothing to enforce yet. |
| Generic declarations and `f<T>(...)` calls | Accepted (ADR 0007); excluded for the same reason as records. |
| Multiline strings | ADR 0011 accepts the feature but defers the common-indentation algorithm to a Q01 follow-up. Implementing one would invent a rule. |
| Relative imports, multi-module programs | **Q05** is unresolved. |
| npm and foreign declarations | **Q06** is unresolved. |
| Manifest, lockfile, `koda fmt`, `koda test`, `koda add` | **Q05/Q07** are unresolved. |
| Source maps | Stage 4 work; arithmetic faults already carry a `.ko` location directly. |
| `Decimal` | Reserved by ADR 0008 with no v0.1 semantics. |
| `entity` | Reserved; persistence is **Q09**. |
| `let` | ADR 0011 explicitly rejected it as the binding spelling. Diagnosed with a machine-applicable fix. |

## How accepted rules are honoured

**Contextual literal typing (ADR 0008).** The lexer keeps the exact source
numeral; nothing is rounded until a target type is selected. An expected type
reaches a literal only from the sources `docs/spec/numbers.md` names: an
annotation, a parameter position, or a declared return position. A sibling
operand never supplies one, so `1 + 1.0` is a mismatch while the same expression
in a Float-expected position is not. Retargeting must be exact in both
directions.

**Checked arithmetic (ADR 0008).** Every `Int` operation is lowered to a runtime
helper carrying its `file:line:column`, so an overflow or a division by zero
stops the program with a located diagnostic and a nonzero exit instead of
wrapping or producing `Infinity`.

**Immutability (ADR 0009).** `const` for immutable bindings, `let` only for
`mut` ones, and a rebinding must have the binding's type. Parameters are
immutable.

**Evaluation order.** An `if` used as a value lowers to a statement-level
temporary, never an IIFE, because an IIFE would capture a `return` belonging to
the enclosing Koda function. When a later operand needs that hoisting, earlier
operands are bound to temporaries first, so they still evaluate left to right
and exactly once.

**Phase contract.** `check` stops after semantic analysis. `build` emits only
when no error diagnostic was produced, so an error-recovery type can never reach
emitted output. The CLI stages artifacts and moves them into place, so a failed
build cannot leave a half-replaced output directory.

## Settled since the first pass

Two details this slice had to guess were referred to the language owner and
accepted on 2026-09-20. They are no longer provisional, and are specified in
[syntax](../spec/syntax.md#q01-follow-up-details-accepted) and recorded under
"Accepted follow-up details" in [ADR 0011](../decisions/0011-q01-concrete-syntax.md).

- **Literal interpolation braces** are escaped `\{` and `\}`.
- **Parentheses end the adjacency** that ADR 0008's minimum-Int exception
  requires. `-9223372036854775808` is a valid `Int`; `-(9223372036854775808)` is
  rejected, because the parenthesised magnitude must inhabit `Int` before the
  negation applies; and `-(-9223372036854775808)` compiles but faults at run
  time, because negating an already typed minimum `Int` overflows.

## Provisional choices

Each of these had to be decided to produce a running program. None is an
accepted decision, and each names the question that owns it.

| Choice | Made here | Owner |
| --- | --- | --- |
| `Int` is a JavaScript `BigInt`, `Float` is a `number`, `Unit` is `undefined` | Only BigInt gives conforming checked 64-bit semantics without heroics. Unobservable in this slice, which has no interop. | **Q08** |
| Canonical **runtime text** for non-finite Float values is `NaN`, `Infinity`, `-Infinity` | ADR 0008 S19 requires canonical special-value text but defers the tokens. This is rendering only: see [special values](#special-float-values-are-not-syntax). | **Q01** |
| `koda:io` and the import spelling that reaches it | An intrinsic exposed provisionally so the slice can produce output: see [the io intrinsic](#the-kodaio-intrinsic). | **Q05** |
| Exit codes: `0` success, `1` diagnostics or runtime failure, `2` usage error | ADR 0010 and ADR 0008 both defer the exit contract. | **Q07** |
| The CLI takes an explicit `.ko` path instead of reading a manifest | Avoids inventing manifest or module-resolution behaviour. | **Q05** |
| `KODA-P0002`, `KODA-N0002`, `KODA-T0006`, `KODA-T0007` | `docs/spec/diagnostics.md` states its code table is a candidate list, not a frozen registry. These four name conditions the accepted decisions require but that table does not yet cover. Marked `CANDIDATE` in `codes.ts`. | **Q07** |
| `Bool` cannot be interpolated into a string | ADR 0008 fixes numeric interpolation text; other conversions "remain to be specified". Rejecting is the conservative reading. | Specification completion |
| A comparison operand gets no expected type, so `price == 1` with a Float `price` is a mismatch | The expectation sources in `docs/spec/numbers.md` do not include comparison operands. Rejecting can be relaxed later without breaking existing programs. | Specification completion |

## Special Float values are not syntax

`NaN` and the infinities have **no literal spelling**, here or in the language.
The lexer has no token for them, the grammar reserves no name for them, and a
source program that writes `NaN` gets an ordinary "cannot find" diagnostic. ADR
0008 S07 exposes special Float values through named values and APIs whose
spelling is still deferred, and this slice does not anticipate that API.

What *is* accepted is that a finite numeral which overflows rounds to a signed
infinity as a **value** (ADR 0008 S06), so `1e999` is a valid Float expression.

The strings `NaN`, `Infinity` and `-Infinity` appear in two places, both of
which are output rather than input:

- the **canonical runtime text** used when such a value is interpolated into a
  string, which is provisional pending Q01's choice of tokens; and
- the **generated JavaScript** for a non-finite Float constant, which is a
  target-language detail with no Koda-level meaning.

`tests/diagnostics/special-float-values.ko` pins this distinction.

## The `koda:io` intrinsic

`import { print } from "koda:io"` is the only import the slice resolves, and it
is **not a module system**. `print` is a compiler and runtime intrinsic; the
import spelling exists so a program can produce output at all. Nothing is
resolved from disk, there is no module graph, no manifest, and no export
visibility model. The exported `main` entry exists for the same reason.

None of that settles Koda's module, import, export or entry design. **Q05
remains AWAITING DECISION** and may replace all of it. See
[projects and modules](../spec/project-structure.md#relationship-to-compiler-slice-0).

## Layout

```text
packages/
  compiler/   source manager, diagnostics, lexer, parser, numerals, checker, IR, emitter
  runtime/    koda-runtime.mjs, imported by generated programs
  cli/        the single koda command
tests/
  syntax/ types/ diagnostics/   .ko fixtures with .diags expectations
  execution/                    .ko fixtures with .out and optional .exit
```

The split follows the dependency direction in
[compiler architecture](../architecture/compiler.md): tools depend on the
compiler, the compiler depends on nothing outside itself, and the compiler takes
a host interface rather than touching the filesystem. Diagnostics live inside
the compiler package for now; `packages/README.md` asks for the minimum split
justified by the implementation rather than eight published packages.

## Fixture format

A `.diags` file records one `CODE severity line:column` line per expected
diagnostic, in the compiler's deterministic order. An empty file means the
program must be accepted. An execution fixture pairs `<name>.ko` with
`<name>.out` for expected standard output and an optional `<name>.exit` for a
nonzero expected exit status.

## Running it

```bash
npm install
npm run build
npm test

node packages/cli/dist/src/main.js run tests/execution/hello.ko
```

## What this slice does not claim

It is not v0.1, not a frozen subset, and not evidence that the Stage 0 exit
criteria are met. Q05–Q08 remain unresolved, and
[CONTRIBUTING.md](../../CONTRIBUTING.md)'s gate still stands: the constructs
those questions govern are absent here precisely so that building this slice did
not answer them by accident.
