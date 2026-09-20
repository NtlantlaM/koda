# ADR 0011: Q01 concrete syntax

- Status: ACCEPTED
- Date: 2026-09-20
- Decision: Q01 Option A, refined for minimal punctuation and beginner-friendly generic calls
- Depends on: ADR 0007, ADR 0008, ADR 0009, ADR 0010
- Informs: parser, formatter, Q05-Q08, first compiler slice

## Decision

Koda v0.1 uses braces for blocks, significant statement newlines, no required semicolons, final block expressions, and explicit early `return`.

Ordinary inferred immutable locals use `name = expression`. `mut name = expression` declares a rebinding-capable local. Q03 remains authoritative: `mut` does not make ordinary fields mutable.

Functions use `fn`, explicit parameter types, and explicit return types. Types/records and enums use braced declarations. Match is exhaustive; `_` is the catch-all; user enum variants are qualified except prelude `Ok`/`Err`.

Generic declarations/type references use angle brackets. Explicit generic calls use `f<T>(...)`, not Rust-style `f::<T>(...)`. Parsing must resolve the form deterministically from grammar/context rather than AI or arbitrary semantic guessing.

Strings use double quotes and `{expression}` interpolation. Multiline strings use triple double quotes with deterministic common-indentation removal. Comments use `//` and non-nesting `/* ... */`.

v0.1 identifiers are ASCII while source, strings, and comments are UTF-8/Unicode. Unicode identifiers are deferred.

Assignment/rebinding is statement-only. Operators have fixed precedence; comparisons do not chain associatively; boolean operators short-circuit; user-defined operator overloading is excluded from v0.1.

Q02 numeric semantics remain authoritative. Syntax supports accepted integer bases, separators, decimal/exponent Float forms and contextual literal typing while preserving exact literal information through parsing.

Q04 Result handling uses explicit match/return as the initial syntax. No implicit propagation operator is included in the first syntax freeze.

## Newline rule

A newline terminates a complete statement except inside grouping/list/call delimiters or when the preceding token syntactically requires continuation. Nested block braces restore statement context. Bare `return` does not consume an expression from the following line.

## Ambiguity rule

The parser must decide syntax from source tokens and grammar. It must not require AI intent or arbitrary symbol-table knowledge to distinguish constructs. Small local disambiguation rules or parentheses are preferred over globally increasing punctuation.

## Beginner experience

Syntax diagnostics follow ADR 0010: say what happened, point to where it happened, explain the relevant rule in ordinary language, and show a valid nearby form when reliable.

## Consequences

Koda's initial surface is visually light while retaining explicit structural braces. The language avoids JavaScript ASI semantics, Python indentation-sensitive block structure, mandatory semicolons, and Rust's turbofish syntax.

The parser needs precise newline/continuation and generic-call lookahead rules, and the formatter must canonicalize optional list separators/line layout.

## Deferrals

- Unicode identifiers and normalization/confusable policy
- nested block comments
- user-defined operators
- concise Result propagation syntax
- advanced patterns/guards
- expression-bodied function shorthand
- exact entity syntax beyond the reserved word
- future concurrency/foreign declaration syntax
