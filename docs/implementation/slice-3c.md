# Slice 3C - core correctness repairs

This correctness-only slice repairs three defects reproduced by the post-Slice-3B
audit. It adds no language features or decisions. The accepted rules remain
[ADR 0008](../decisions/0008-q02-numeric-semantics.md),
[ADR 0011](../decisions/0011-q01-concrete-syntax.md) and
[left-to-right evaluation](../spec/language.md).

## Earlier operands and later hoisted statements

The emitter previously avoided capturing operands whose generated JavaScript
looked like identifiers. A mutable local is an identifier too: hoisting a later
argument that rebinds it delayed the earlier read. The audit's first-argument
example returned 2 instead of 1.

The shared operand-lowering helper now captures every earlier value before a
later operand emits statements. This conservative rule covers function calls,
integer/Float arithmetic, concatenation, equality, ordering, record initializers,
enum payloads, Result payload expressions, nested calls and interpolation.
Records retain source initializer order rather than declaration order. Result
constructors have one payload, but expressions within that payload use the same
machinery. Logical operators retain their separate guarded lowering; unary
operations, field/absence projections and once-bound match subjects do not
introduce an additional sibling operand ordering problem.

## Extreme decimal literals

Exponent parsing previously passed through Number and then BigInt, allowing an
extreme exponent to become Infinity and throw a host exception. Smaller but huge
exponents could request enormous powers of ten before checking Int's range.

Decimal parts now retain mantissa digits as text and an exact BigInt exponent.
Int selection tests decimal scale, trailing-zero divisibility and result digit
count before constructing a bounded magnitude. No expanded power has more than
19 result digits. This is exact classification, not clamping: huge mantissas
whose scale cancels can still produce a small valid Int. Zero remains exact at
any exponent; negative floating zero still cannot retarget to Int.

Out-of-range integral values and fractional values use existing deterministic
diagnostics. Float still uses accepted binary64 parsing: overflow is infinity,
underflow can be signed zero, and the existing underflow warning remains a
warning. Integer bases, separators, direct Int.MIN formation and signed boundary
checks retain their semantics. Source-sized storage and ordinary host resource
limits still apply; this is not a general compiler resource-budget policy.

## Brace-local newline context

The lexer previously used a single grouping depth, suppressing even statement
newlines inside blocks nested in calls. It now saves the enclosing grouping
depth at a brace, restores newline significance inside, and resumes the enclosing
depth on exit. Parentheses/brackets inside the brace can still suppress their
own layout newlines. The same mechanism preserves record entry separators.
Comments and string scanning do not alter delimiter context; interpolation
expressions keep their existing separate lexer. No parser or AST change was
needed, and multiline string support was not introduced.

## Regression coverage

- [Compiler regressions](../../packages/compiler/test/repairs.test.ts): observable
  mutable operand ordering, Result rebinding, skipped logical operands, early
  returns, extreme literals, exact cancellation, diagnostics/JSON, nested blocks,
  ordinary grouped calls, generic records and malformed-delimiter recovery.
- [CLI regressions](../../packages/cli/test/repairs.test.ts): deterministic output,
  valid JSON including the accepted underflow warning, failed compilation creating
  no output directory and preserving a previous successful build.
- [Execution fixture](../../tests/execution/core-repairs.ko): repaired order and
  layout with real Node execution, plus extreme valid Float/Int values.
- [Negative fixture](../../tests/types/extreme-numerals.ko): extreme positive and
  negative exponents produce T0007 instead of host exceptions.

The only changed pre-existing test expectations describe decimalParts' private
representation (digit string and BigInt scale). Existing language fixture
expectations are unchanged. All three defect reproducers failed before repairs.

## Validation and scope

Final clean validation: **224 tests pass**, including all **15 execution
fixtures**. The targeted compiler/CLI regression suites contain **46 passing
tests**. Deterministic build comparison, failed-build isolation and preservation,
JSON diagnostics and diagnostic ordering all pass. Documentation links and
whitespace are checked separately. Session-start hash comparisons verify that
the checker, obligation engine, AST/IR, parser and runtime remain unchanged.

Q05, Q06, Q07 and Q08 remain unchanged. No generic functions, collections, loops,
ownership or new syntax were added. Result/structural obligation, generic,
nullable and function-type semantics remain unchanged. Runtime representation
and runtime code remain unchanged. No stop condition or new semantic decision
was needed. This slice ends with the three repairs.
