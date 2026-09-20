# Decisions before specification freeze

Q11 and Q02 are **ACCEPTED** by explicit user decisions on 2026-09-20; see [ADR 0007](../decisions/0007-q11-type-boundaries.md) and [ADR 0008](../decisions/0008-q02-numeric-semantics.md). Q01, Q03–Q10, and Q12–Q13 remain **AWAITING DECISION**, with no selected options.

Unresolved recommendations are advice, not accepted rules. The user's principles and explicit Q11 and Q02 decisions are constraints; assistant-authored details do not become approved merely by appearing in a specification or ADR. Feature maturity (ACCEPTED / EXPERIMENTAL / LATER / REJECTED) and decision state are separate.

Read the [specification review](specification-review.md). Each proposal below includes the exact question, alternatives, benefits/costs, comparisons with Rust, Kotlin, Swift, TypeScript, Go, and Python, six impact dimensions, and a recommendation or an explicit acceptance record. Comparisons cite primary documentation, researched 2026-09-19. Ecosystem/library behavior is distinguished from core grammar. Performance and AI effects are qualitative design assessments, not measurements.

## Recommended resolution order

| Order | Proposal | Dependencies | Gate | State |
| --- | --- | --- | --- | --- |
| 1 (resolved) | [Q11: Type boundaries, inference, nulls, strings](proposals/q11-type-boundaries.md) | User principles | v0.1 freeze | ACCEPTED — ADR 0007 |
| 2 (resolved) | [Q02: Numbers](proposals/q02-numbers.md) | Q11 | v0.1 freeze | ACCEPTED — ADR 0008 |
| 3 | [Q03: Mutation and aliasing](proposals/q03-mutability.md) | Q11 | v0.1 freeze | AWAITING DECISION |
| 4 | [Q04: Result obligations](proposals/q04-results.md) | Q02, Q03 | v0.1 freeze | AWAITING DECISION |
| 5 | [Q01: Concrete syntax](proposals/q01-syntax.md) | Core semantic choices above | v0.1 freeze | AWAITING DECISION |
| 6 | [Q05: Projects and modules](proposals/q05-projects.md) | Q01 | v0.1 freeze | AWAITING DECISION |
| 7 | [Q06: JavaScript/npm boundary](proposals/q06-interop.md) | Q02–Q05 | v0.1 freeze | AWAITING DECISION |
| 8 | [Q08: JavaScript representations](proposals/q08-representation.md) | Q06 and core semantics | v0.1 freeze | AWAITING DECISION |
| 9 | [Q07: Tool contracts and entry points](proposals/q07-tool-contracts.md) | Q01, Q04–Q06, Q08 | v0.1 freeze | AWAITING DECISION |
| 10 | [Q10: Structured concurrency](proposals/q10-concurrency.md) | Especially Q03, Q04, Q06 | Future feature | AWAITING DECISION |
| 11 | [Q09: Entities and persistence](proposals/q09-persistence.md) | Q10 and core semantics | Future feature | AWAITING DECISION |
| Parallel | [Q12: License and contribution governance](proposals/q12-governance.md) | Repository owner's decision | Public release/contribution policy | AWAITING DECISION |
| Before publishing | [Q13: Package ownership and release trust](proposals/q13-publishing.md) | Q05–Q07, Q12 | Public releases/packages | AWAITING DECISION |

Q01–Q10 retain their original IDs. Q11 makes previously implicit type-system choices explicit. Q12–Q13 cover the original unnumbered governance/publication questions.

The order permits feedback: confirm the Q05 lockfile policy against Q06 npm transport; reconcile grammar with later import/foreign/test declarations before freezing it. Q10 precedes Q09 because transaction cancellation depends on task lifetimes. Future feature proposals need not block a deliberately smaller v0.1, but their deferral must also be chosen explicitly.

## How a decision closes

Record the selected option and each amended subchoice, rationale, approver, and date in a follow-up ADR. Update specs, feature statuses, examples, and future conformance expectations together. Silence, a recommendation, or a documentation commit is not approval.

**Unresolved choices remain AWAITING DECISION**, including syntax/API spellings, exit codes, and release policies. Q11's and Q02's expressly approved rules and deferrals are accepted as recorded in ADRs 0007 and 0008; no unrelated recommendation or broader release scope is selected. Selecting a main option must not silently select unapproved refinements.

No lexer, parser, compiler, runtime, CLI, or package-manager implementation is authorized by this review.
