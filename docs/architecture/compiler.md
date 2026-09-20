# Compiler architecture

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** user requirements for implementation language, backend, and compiler authority. Phase separation, internal representations, and runtime contracts below are proposals **AWAITING DECISION**, especially Q08.

## Pipeline

```text
.ko source + manifest + explicit foreign declarations
    -> source manager and lexer
    -> parser and syntax tree
    -> module resolution and symbol binding
    -> type inference, checking, and exhaustiveness
    -> typed high-level IR
    -> lowered JavaScript-oriented IR
    -> JavaScript ES modules + source maps
    -> small Koda runtime + Node.js
```

Diagnostics are shared across all phases. `check` stops after semantic analysis; `build` emits only after all errors are resolved. The TypeScript compiler checks the implementation, not user Koda programs. Emitting TypeScript and using its checker as Koda's semantics is excluded by ADR 0001.

## Responsibilities and invariants

| Phase | Input/output and invariants |
| --- | --- |
| Source manager | Stable file IDs, UTF-8 spans, line maps, normalized project paths |
| Lexer | Tokens and comments/trivia with precise spans; no semantic guesses |
| Parser | Syntax tree with explicit recovery nodes; preserve formatter-relevant trivia |
| Resolver | Module graph and symbol IDs; report missing/duplicate/private names and cycles |
| Type checker | Resolve declared types, infer locals, check branches/results/mutability and exhaustive patterns |
| Typed IR | Every expression has a type and origin span; names reference symbols, not strings |
| Lowering | Make evaluation order, branching, result/enum representation, and runtime checks explicit |
| JS emitter | Deterministic escaping and hygienic names; produce ES modules and source maps |
| Runtime | Only behavior required by Koda semantics; no framework, ORM, or AI dependency |

Error recovery types may exist during checking but cannot enter emitted IR. User syntax errors should never escape as internal exceptions. Track source origins through synthesized nodes so runtime stack locations can map back to `.ko` files.

## Boundaries

`compiler` has no CLI/process dependency and accepts a host interface for reading sources and resolving modules. It returns structured diagnostics and artifacts. `cli` owns file writes, argument parsing, process execution, and exit codes. `formatter` consumes syntax/trivia without type checking. `test-runner` uses the same compiler API. `package-manager` resolves locked inputs before compiler invocation.

The standard library exposes Koda signatures; the runtime implements required Node-facing behavior. Explicit foreign adapters validate values and contain foreign throws. Persistence adapters and concurrency runtimes remain deferred packages, not conditionals scattered through parsing or checking.

Use a package dependency direction of tools -> compiler -> shared source/diagnostic infrastructure. Generated programs depend on the runtime; the compiler need not load the generated runtime to check source. Avoid prematurely splitting every phase into a separately versioned npm package.

## Initial implementation strategy

After syntax freeze, prefer a hand-written lexer, recursive-descent declarations/statements, and a Pratt expression parser for targeted diagnostics. Prototype ambiguous constructs before committing. Represent types and IR with discriminated TypeScript unions and explicit IDs. A full constraint solver, optimizer, incremental daemon, and plugin system are unnecessary for v0.1.

Choose the JavaScript representation of `Unit`, nullable values, enum tags/payloads, and source maps in Q08 before backend work. [Q02 numeric semantics](../spec/numbers.md) is accepted; Q08 chooses conforming Int storage/check machinery and Float lowering, not arithmetic meaning. Future literal handling must retain exact magnitude until contextual/default typing, and required constant evaluation must remain separate from ordinary reachability diagnostics. Preserve left-to-right evaluation and execute side-effecting expressions exactly once when lowering `match` or runtime checks.

Build outputs must be deterministic for the same source, compiler version, target, and lockfile. The CLI should stage output and avoid replacing a valid build with partial artifacts. No source text is executed during lexing, checking, or formatting. No network or AI service is required to determine correctness.

## Validation

The [conformance strategy](../../tests/README.md) tests language rules separately from implementation internals. The critical boundary is that accepted source has specified behavior and rejected source gets useful diagnostics. JavaScript execution tests must verify semantics that differ from JavaScript defaults, particularly numbers, nullability, enum matches, and foreign failure conversion.
