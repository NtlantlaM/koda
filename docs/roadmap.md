# Roadmap to v0.1

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Stages are ordered by dependency, not calendar estimates. A first executable
slice of Stages 1-4 exists; see [compiler slice 0](implementation/slice-0.md).
It implements only constructs governed by already-accepted decisions, so it
does not satisfy the Stage 0 exit criteria and does not resolve Q05-Q08. Each exit criterion must be met before advancing; scope changes require updated decisions.

## Stage 0 — Freeze the executable language subset

Q11 and Q02 are resolved by [ADR 0007](decisions/0007-q11-type-boundaries.md) and [ADR 0008](decisions/0008-q02-numeric-semantics.md). Resolve Q01 and Q03–Q08, formalize the complete subset grammar and static rules consistent with both accepted decisions, and update the status register. Decide mutation, Result enforcement, module/manifest behavior, foreign ABI, tool commands, runtime representations, and supported host versions. Complete numeric lexical/API spelling and the separate required-constant-evaluation and unreachable-code diagnostic contracts without reopening accepted arithmetic semantics. Interpolation and multiline strings are accepted features whose concrete syntax still needs Q01. Convert examples into an agreed fixture inventory with expected behavior and negative cases.

Exit: all nine v0.1 blocking questions have recorded decisions; every v0.1 construct has syntax, typing, runtime behavior, and diagnostic expectations; experimental persistence/concurrency are explicitly excluded. Selecting a license is required before public release. **The current task stops at this design baseline; it does not execute later stages.**

## Stage 1 — TypeScript workspace, sources, and diagnostics

Create the smallest justified workspace/package split and development commands. Implement source identity, spans, tokens, and the shared diagnostic model. Pin host tools and dependencies.

Exit: lexer fixtures cover valid/invalid tokens and UTF-8 locations; human/JSON diagnostics agree; CI checks the TypeScript implementation. No claim of executable Koda yet.

## Stage 2 — Parsing and formatting

Implement the frozen grammar, recovery, and syntax/trivia representation. Add the canonical formatter and `fmt --check`.

Exit: supported syntax parses; malformed syntax gives bounded, precise diagnostics; reserved future features are rejected clearly; formatting is idempotent and preserves comments/program structure.

## Stage 3 — Modules and static semantics

Implement project/module resolution, binding, local inference, nominal records, generic declarations/calls, null safety, mutability checks, Result-use policy, and exhaustive enum matching. Expose `koda check` using the shared API.

Exit: positive and negative conformance cases cover every supported type rule; diagnostics point to useful origins; failed checking cannot emit executable code. No unchecked JavaScript fallback.

## Stage 4 — JavaScript/Node execution

Introduce typed IR, lowering, minimal runtime/stdlib, ESM emission, and source maps. Expose `build` and `run` with the frozen entry contract. Implement [accepted numeric behavior](spec/numbers.md) rather than inheriting JavaScript defaults, and satisfy the [future numeric conformance obligations](../tests/numeric-conformance.md) across build modes. Persistence adapter implementation remains deferred until persistence.

Exit: core examples execute with expected output; evaluation order and runtime boundary cases pass; errors map to `.ko`; repeated builds are deterministic; failed builds do not publish partial artifacts.

## Stage 5 — Unified local tooling and narrow npm interop

Implement the chosen local manifest/lockfile policy, local dependency installation, the minimal supported npm subset, generated checked foreign adapters, and the test runner. Present all tools under `koda`.

Exit: a clean fixture project can install locked inputs, format, check, build, run, and test using documented commands. Foreign throws/invalid values produce the specified failures. Dependency tests are reproducible; unsupported npm APIs receive explicit diagnostics. Registry publishing and lifecycle-script execution remain outside scope.

## Stage 6 — v0.1 release candidate

Audit specification/implementation agreement, finalize diagnostic schema and supported platforms, publish limitations, license, and contributor guidance, and verify installation/reproduction from a clean environment.

Exit: all accepted v0.1 rules have conformance coverage; examples and CLI documentation match actual behavior; release artifacts are reproducible under the documented environment; no EXPERIMENTAL feature is silently advertised as supported.

## After v0.1

Prioritize from demonstrated application needs: traits, collections/iteration/closures, structured concurrency, persistence adapters and migrations, editor tooling, and further targets. Q09 and Q10 gate persistence and concurrency respectively. No milestone promises a full framework or ORM inside the core grammar.
