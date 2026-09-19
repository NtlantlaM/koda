# Contributing to Koda's design

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Read the [principles](docs/spec/language.md), [status register](docs/design/feature-status.md), and relevant specification before proposing a change.

A design proposal should identify a concrete problem, show a small `.ko` example, describe typing and runtime behavior, consider diagnostics and tooling, and explain why existing features cannot solve it. Include costs, alternatives, and compatibility implications. Every new feature must justify its existence.

Use ACCEPTED, EXPERIMENTAL, LATER, or REJECTED for feature maturity as defined in the status register. Mark every unresolved design choice AWAITING DECISION separately; recommendations require explicit approval before they become decisions. Contributors may propose status changes; changing an accepted decision requires a reviewed ADR that supersedes the old decision. Keep the register, specifications, roadmap, and examples consistent in the same change.

Examples currently demonstrate design intent only. Do not describe a proposal as implemented or tested by a compiler. Compiler work begins only after the blocking decisions and Stage 0 exit criteria in the roadmap are resolved.

The intended project is open source. A license must be selected and added before public release; this repository does not yet grant an open-source license. Do not assume a license from this statement of intent.
