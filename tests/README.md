# Future conformance strategy

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: planned; no tests or compiler are implemented in this repository.

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
