# Slice 3B - structural Result obligations

Status: implemented. All three dependency-ordered stages and full validation
pass. The historical Slice 2C container-tracking limitation is closed for the
currently implemented language subset. This records implementation of the
human-authorized semantics, not an additional language decision.

## Accepted scope

[ADR 0010](../decisions/0010-q04-result-obligations.md#accepted-slice-3b-structural-responsibility-follow-up)
defines structural responsibility with renewal at receiving boundaries. Values
remain readable after transfer. No ownership, moves, borrowing, lifetimes,
alias/provenance graph, runtime obligation state, function effects, generic
functions or Q08 changes were introduced. Parser, AST, typed IR, emitter and
runtime representations are unchanged by this slice.

## Ordered implementation stages

Documentation was reconciled before compiler behaviour. Regression tests pinned
the accepted rules before the analysis stages were implemented.

1. A: both logical operators preserve skipped and executed paths, including
   their true/false environments in enclosing conditions. All 12 Stage A tests
   and the original 86-test suite passed before replacing direct tracking.
2. B: instantiated stored-member shapes, structural locations, independent
   transfer/renewal, temporaries and generations. All 42 A/B tests passed before
   conditional payload completion.
3. C: variant/nullable-dependent presence, retained wildcard residuals and nested
   Results in both Ok and Err payloads. All 67 initial new tests passed, followed
   by edge, execution and CLI validation.

## Analysis representation

[obligation-shapes.ts](../../packages/compiler/src/check/obligation-shapes.ts)
memoizes shapes by nominal declaration identity and ordered type arguments.
Actual fields and payloads use existing instantiated member substitution.
Phantom generic arguments therefore add no responsibility. Record children are
independent; enum alternatives, Result acknowledgment and nullable acknowledgment
are explicit. Ordinary typing and recursive-data rejection precede this pass.

[obligations.ts](../../packages/compiler/src/check/obligations.ts) tracks local,
parameter and analysis-only temporary roots with binding generations. Structural
paths select fields, variant payload positions and nullable-present subtrees.
Every acknowledgment stage has Outstanding, Handled or Transferred state;
possible alternatives are separate from that state.

Continuing branch environments retain correlated structural state and presence.
An outstanding responsibility on any reachable alternative causes a diagnostic.
Returning paths are checked at their exit and removed. Identical environments
are coalesced after statements; differing states are never merged away. There
is no loop fixpoint or general symbolic executor. Distinct correlated paths can
still grow combinatorially in deeply branching functions; this implementation
has no complexity cap that silently drops paths.

## Transfer and renewal

Receipt snapshots the selected shape, retires outstanding source responsibility
and independently renews the receiver, including previously handled members.
Reading alone does not renew. Repeated storage creates separate receiving duties;
whole-record copies renew every present member. Source values remain readable,
and later source handling cannot acknowledge an already receiving destination.

Parameters acquire their declared type's shape. Calls transfer arguments and
acquire fresh result shapes from declared return types, without private handled
history. Temporary argument carriers also preserve already evaluated values if
a later argument returns early. Construction members acquire responsibility in
evaluation order, so an interrupted initializer creates no phantom later fields.

Projection transfers only its subtree. Unselected temporary siblings survive
until expression cleanup, including nested projections and returns. Block and
branch tails transport existing accounting to their consumer, without becoming
discards. Assignment evaluates and transfers its RHS before checking the old
generation, then installs and renews the new generation.

## Conditional payloads

Known enum construction restricts responsibility to its actual alternative.
Unknown parameters/call results retain possible alternatives. Matching refines
presence before transferring bound payloads; impossible variants add no duties.

Nullable acknowledgment is separate from the present subtree. Null contributes
no contained payload, but a Result? binding initialized with null still requires
its existing nullable acknowledgment. Binding a present payload renews its own
responsibility. Nullable aggregate and nullable field shapes remain distinct.

Visible Ok and Err alternatives acknowledge only the outer Result. Payload and
whole-value wildcards retain outstanding nested responsibility under the named
source or an analysis-only temporary. A later explicit match may handle that
retained named subtree; both Ok and Err can contain independent Results.

## Diagnostics

Existing codes are extended: T0005 for discarded expressions/temporary residuals,
T0012 for abandoned scope/return paths, and T0013 for overwritten generations.
Messages identify structural paths; secondary spans identify acquisition sites.
Reports are deduplicated by responsibility location and origin across alternative
exits. An outstanding outer acknowledgment is reported before hidden descendants,
avoiding redundant nested errors. Q07's final schema/code decisions remain open.

## Validation and intentional expectation changes

The final clean build and complete suite pass: **176 tests**, including all
**14 execution fixtures**. This adds 86 compiler regression/edge tests, three
structural CLI contract tests and one execution fixture to the 86-test baseline.

- [Compiler tests](../../packages/compiler/test/obligations.test.ts): short-circuit
  flow, fields, repeated storage, copy renewal, boundaries, generations, generic
  shapes, conditional presence, wildcard/nested Result duties and diagnostics.
- [CLI tests](../../packages/cli/test/obligations.test.ts): stable source-located
  JSON, byte-identical builds, execution, no artifacts on fresh failure and
  preservation of prior successful artifacts after failure.
- [Execution fixture](../../tests/execution/container-obligations.ko): readability
  after transfer, repeated storage, copying, replacement, generic/nullable/enum
  nesting and skipped logical operands.
- [Existing fixture](../../tests/types/generic-construction-obligations.ko): adds
  T0012 at 24:40 and 29:37 for the two formerly untracked generic containers.
  Its original three diagnostics remain unchanged. Comments now explain closure.

Documentation links, decision-state consistency and whitespace checks accompany
full validation. Session-start hashes verify that existing parser/AST/IR/emitter,
runtime and other unrelated work were preserved, including uncommitted Slice 3A
changes. No new language ambiguity or stop condition was encountered. Work stops
at Slice 3B; global eventual handling, effect metadata and future control-flow
features remain outside this implementation.
