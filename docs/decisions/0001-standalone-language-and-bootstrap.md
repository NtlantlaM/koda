# 0001: Standalone language and bootstrap target

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED**
Date: 2026-09-19

## Context

Koda needs a practical implementation path without becoming a TypeScript dialect or an AI service wrapper.

## Decision

Define an independent language using `.ko` source files. Implement the initial compiler/toolchain in TypeScript and emit JavaScript for Node.js. Koda owns parsing, name resolution, inference, type checking, and diagnostics. AI is optional and has no authority to override compiler errors.

## Alternatives

Translating informal prompts or lightly rewritten TypeScript would reduce initial work but would not supply independent language semantics. Native code generation could provide more runtime control but would expand the bootstrap effort.

## Consequences

The implementation can use the Node ecosystem while checking Koda rules itself. JavaScript differences need deliberate lowering and runtime checks. Runtime representation, supported Node versions, and foreign ABI remain Q02/Q05/Q06/Q08. TypeScript compiler errors describe implementation defects, not Koda source diagnostics.
