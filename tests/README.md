# Future conformance strategy

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: the layout below is the plan. The `syntax/`, `types/`, `diagnostics/`
and `execution/` directories now hold real fixtures for the subset that
[compiler slice 0](../docs/implementation/slice-0.md) implements; the other
directories, and most of the coverage listed here, remain future work.

```text
tests/
  syntax/            Valid forms and parser recovery fixtures
  types/             Inference, nullable, nominal, Result, and mutability cases
  diagnostics/       Codes, spans, structured output, focused rendering snapshots
  execution/         Checked programs with expected Node output and exit status
  interop/           Foreign conversion, throw, and unsupported-value cases
  formatter/         Stable formatting, comment preservation, idempotence
  projects/          Resolution, manifests, lockfiles, CLI and test discovery
```

Each fixture should reference the specification rule it demonstrates. Positive tests compile; negative tests assert diagnostic codes and relevant source spans. Execution tests compare observable behavior, not generated-code formatting. Only selected emitter snapshots should constrain code shape.

Before v0.1 release, cover at least: immutable reassignment; missing/extra record fields; nullable access without narrowing; missing enum arms; mismatched associated data; ignored Result expressions; generic inference ambiguity; numeric boundaries; left-to-right evaluation; reserved unsupported features; exact-case imports and cycles; malformed input recovery; foreign throws and invalid values; and failed builds producing no new executable output.

Formatter tests check idempotence, comment retention, and preservation of the parsed program. Package tests use temporary local fixtures and locked fake dependencies, not a live registry. Test-runner tests include successful assertions, failures, crashes, and no-test behavior. Stage 0 decides exact conventions.

The `.ko` examples are future integration fixtures only after syntax and semantics freeze. Experimental examples are excluded from the v0.1 success suite and may become unsupported-feature diagnostic fixtures. Documentation consistency checks cannot substitute for executing a compiler.

The accepted [Q11 decision](../docs/decisions/0007-q11-type-boundaries.md) adds future conformance obligations: nominal distinction for same-shaped declarations; explicit function boundaries with inferred locals/call results; invariant generics; refinement by match and explicit checks on stable immutable locals without alias-aware mutable casts; rejection of written `T??` and flattened generic nullable substitution; primitive equality without exposed object identity; exact scalar-value string equality and rejection of lone surrogates at foreign boundaries; interpolation/multiline forms once Q01 fixes their syntax; shadowing/duplicate rejection; ordinary function recursion and deferral of recursive data. This is a fixture plan only; no tests or implementation are added here.

The accepted [Q02 decision](../docs/decisions/0008-q02-numeric-semantics.md) adds the [future numeric conformance inventory](numeric-conformance.md), covering literals, checked Int arithmetic, binary64 rounding and special values, explicit conversions, required constant evaluation versus unreachable ordinary code, text/JSON/foreign boundaries, and later persistence adapters. These are documentation obligations only; API spelling and tool contracts remain pending.

The accepted [Q03 decision](../docs/decisions/0009-q03-mutation-and-aliasing.md) adds future conformance obligations: immutable-by-default bindings; explicit rebinding for mutable locals; rejection of ordinary field and nested mutation; semantic alias independence despite permitted physical sharing; immutable function parameters; immutable core collections; no required user-visible clone for ordinary values; preservation of value semantics across JavaScript boundaries; immutable-only closure capture in v0.1; and rejection of ownership/borrowing as a v0.1 requirement. Entity mutation and shared mutable concurrency remain deferred.


The accepted [Q04 decision](../docs/decisions/0010-q04-result-obligations.md) adds future conformance obligations for reachable bare Result rejection, local Result abandonment/overwrite checks, explicit handling and transfer, deliberate-ignore visibility, and deterministic beginner-first diagnostics. Tests must also establish that baseline explanations and correctness do not require AI and that any mechanically safe edit classification comes from deterministic tooling.


Slice 2C adds must-handle obligations: a bare discarded Result; a binding left unhandled at scope exit; overwrite before and after discharge; discharge requiring visible `Ok` and `Err` arms, with `Ok + _` and lone `_` failing to discharge; branch joins where one path handles and another does not; early return abandoning or transferring; Result parameters ignored, handled and forwarded; transfer through call arguments, returns, record construction and enum payloads; alias transfer; nested Result inner obligations; and the two-step nullable Result shape. The container-tracking limitation is documented rather than enforced.

Slice 2B adds Result obligations: `Result<T, E>` application and arity; `Ok`/`Err` in annotated, tail, `return` and argument contexts, and under an expected `Result<T, E>?`; rejection of an unconstrained `Ok`/`Err`; payload type mismatches; exhaustive `Ok`/`Err` matching and missing, duplicate and wildcard arms; bindings that differ from `value`/`error`; no-shadowing on those bindings; rejection of `Result`, `Ok` and `Err` as user declarations and of `Result.Ok(...)`; nested applications; and the preserved boundary forbidding a direct variant pattern through a nullable Result. Must-handle enforcement is **not** covered here; it belongs to slice 2C.

The accepted null-refinement follow-up to [Q11](../docs/decisions/0007-q11-type-boundaries.md) adds obligations: `T` accepted where `T?` is expected and the reverse rejected; `null` rejected for a non-nullable type and when unconstrained; written `T??` rejected; unsafe nullable use diagnosed; nullable `match` with a `null` arm and a binding arm, including the unreachable ordering; refinement by `x != null` and by the `else` of `x == null`; refinement of immutable locals and parameters but not of mutable locals, properties or arbitrary expressions; lexical lifetime with reset at an ordinary join; left-to-right `&&` composition including the reversed order that does not refine; and no refinement through `||`, negation or an intermediate Bool.

The accepted [Q01 decision](../docs/decisions/0011-q01-concrete-syntax.md) adds future syntax fixtures for significant newlines and continuation, bare immutable versus `mut` bindings, tail expressions and bare-return line boundaries, record/control-head disambiguation, `f<T>(...)` generic calls versus comparison tokens, interpolation and multiline indentation, comments, ASCII identifier limits, match catch-alls/qualified variants, and accepted numeric literal forms. Parser tests must demonstrate that these decisions do not depend on symbol-table or AI intent.

## Slice 2A coverage

The [Slice 2A implementation](../docs/implementation/slice-2a.md) adds source
checking fixtures for generic records/enums, declaration-local parameters,
multi-parameter/multiline/trailing-comma declarations, nested and nullable
applications, recursive substitution, invariant and nominal identity, arity,
unknown names, duplicate/colliding parameters, finite nesting, recursion rejection,
and unsupported generic values/functions/Result. Generic construction is deliberately
absent; type-checking fixtures use annotations, nongeneric signatures, fields and
payload descriptions rather than an invented value syntax. Existing execution
fixtures continue to cover records, enums, matching, null refinement and numerics.
