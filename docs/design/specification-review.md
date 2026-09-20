# Review of the initial specification

Review date: 2026-09-19. The findings below record the initial review. Update on 2026-09-20: [Q11 is ACCEPTED](../decisions/0007-q11-type-boundaries.md); all other unresolved questions remain **AWAITING DECISION**.

## Repository verification

From the original workspace, `git rev-parse --show-toplevel` returned `C:/Users/nhlan/OneDrive/Documents/Code Projects`, an enclosing repository. From the nested Koda checkout, it returned `C:/Users/nhlan/OneDrive/Documents/Code Projects/koda/koda`. That checkout's origin is `https://github.com/NtlantlaM/koda.git`.

Moved all 33 original files into the Koda checkout root, preserving relative paths. SHA-256 checks confirmed identical contents immediately after relocation. All 18 existing files under its `.git` directory were unchanged by the move. No Git metadata was moved, edited, or deleted as part of relocation. Later user-authorized commit/push operations necessarily update Git metadata through Git itself.

## Complete review coverage

Reviewed README, CONTRIBUTING, all seven specs, compiler architecture, feature register, open questions, all six ADRs and index, roadmap, package/test plans, example index, and all eight `.ko` examples.

| Finding | Consequence | Proposal |
| --- | --- | --- |
| Newline/tail-expression rules, record/control-flow braces, and generic/comparison parsing are incomplete. | A parser must not invent rules. | Q01 |
| Safe-range Int lacks division, conversion, overflow, and intermediate-precision rules. | JS lowering could silently corrupt values. | Q02 |
| Immutable binding and immutable object guarantees are conflated. | Shared aliases could violate user expectations. | Q03 |
| Result discard, overwrite, and transfer rules are incomplete; print returns Unit despite I/O failure. | Define what checking proves and how I/O errors surface. | Q04 |
| One Koda lockfile is proposed alongside npm delegation. | Decide how npm's own resolution data fits one authority. | Q05, Q06 |
| Foreign module evaluation can fail before a function wrapper runs. | Call-level catch alone is insufficient. | Q06 |
| Entry/test conventions, JSON streams, Unicode positions, and exit codes are incomplete. | CI/editor contracts need precise answers. | Q07 |
| Unit, nullable Unit, enum identity, generic erasure, output packaging are unspecified. | Unit and absence must remain distinguishable. | Q08 |
| User.create does not identify its connection, identity source, or transaction. | Compact spelling must not introduce hidden persistence context. | Q09 |
| Returning Err from a scope does not define sibling cancellation. | Result-as-value differs from task failure. | Q10 |
| Nominal records, inference boundaries, variance, strings, equality, shadowing, and recursive data were implicitly chosen. | Strong typing alone does not settle these. | New Q11 |
| License, contribution authority, namespace control, signing, and registry policy were unnumbered. | Preserve them without silently adopting legal/publishing policy. | New Q12, Q13 |
| Some ACCEPTED/LATER/REJECTED entries reflect assistant recommendations beyond the user's explicit principles. | Separate principle acceptance from unresolved design detail and release scope. | Status notices and all proposals |

The user's explicit principles remain constraints: standalone .ko language, optional AI, compiler authority, readability/diagnostics, strong typing/inference, immutable defaults with mut, T?, Result, enums/matching, type/entity distinction, explicit writes, composition/traits, structured concurrency, one toolchain, TypeScript bootstrap, JavaScript/Node target, and no framework grammar.

Old specs and ADRs remain a traceable baseline. Concrete details not explicitly approved remain **AWAITING DECISION**. Q11's rules and explicit deferrals were approved on 2026-09-20 and conflicting specifications have been reconciled; other release-scope recommendations remain proposals. Examples retain their original illustrative spelling. The freeze gate includes the now-resolved Q11 and the still-unresolved Q01–Q08.

See the [ordered decisions](open-questions.md). No executable code was added.
