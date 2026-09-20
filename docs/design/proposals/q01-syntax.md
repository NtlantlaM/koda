# Q01: Concrete syntax and ambiguity

State: **ACCEPTED** via [ADR 0011](../../decisions/0011-q01-concrete-syntax.md). Selected option: **A**, refined for beginner-friendly generic calls and minimal punctuation.
Resolve after Q11/Q02–Q04, then reconcile imports/foreign/test declarations before freeze.

Q11 is now ACCEPTED via [ADR 0007](../../decisions/0007-q11-type-boundaries.md). Its shadowing restrictions, interpolation, and multiline-string support constrain this proposal. Their remaining grammar details are still Q01; Q01 itself is not resolved.

[Q02 / ADR 0008](../../decisions/0008-q02-numeric-semantics.md) now fixes numeric semantics. Q01 must supply exact base/separator/exponent/sign grammar, direct minimum-literal/parenthesis handling, Decimal reservation, special-value/text tokens, and numeric API spelling without changing those rules. Decimal is not usable in v0.1; exponentiation and other explicitly deferred numeric features are not added by this syntax proposal.

## Decision and why it matters

Choose statement termination, block values, record construction, generic calls, lexical policy, patterns, and reserved words. A grammar must let readers and the compiler interpret code without guessing from an AI's intent or future symbol tables.

## Alternatives

| Option | Surface family | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Braces, significant statement newlines, tail expressions, restricted record literals in control heads | Close to current readable examples; low punctuation | Precise continuation rules and brace restrictions required |
| B | Braces, mandatory statement semicolons, unterminated tail expression | Clear statement/value distinction and recovery | More punctuation and missing-semicolon diagnostics |
| C | Indentation blocks, logical newlines, explicit return for function values | Familiar to Python users, visually light | Whitespace-sensitive edits; substantial rewrite of examples; expression blocks need separate design |

## Established languages

| Language | Approach |
| --- | --- |
| Rust | Braced record literals are restricted in control heads unless nested, such as in parentheses; expression generic arguments use ::<...> to disambiguate. [Struct expressions](https://doc.rust-lang.org/reference/expressions/struct-expr.html), [paths](https://doc.rust-lang.org/reference/paths.html) |
| Kotlin | Grammar explicitly models newlines and separators rather than treating all whitespace identically. [Grammar](https://kotlinlang.org/spec/syntax-and-grammar.html) |
| Swift | Semicolons can separate same-line statements; lexical rules include whitespace-sensitive operator classification. [Basics](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/TheBasics.md), [lexical structure](https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/ReferenceManual/LexicalStructure.md) |
| TypeScript | Its JS statement surface inherits automatic semicolon insertion, with restricted line-termination cases. [ECMAScript ASI](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-automatic-semicolon-insertion) |
| Go | Formal semicolon insertion follows specific token rules; braces still delimit blocks. [Specification](https://go.dev/ref/spec) |
| Python | INDENT/DEDENT and logical lines define blocks; delimiter nesting permits implicit line joining. [Lexical analysis](https://docs.python.org/3/reference/lexical_analysis.html) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Readable, continuation exceptions to learn | Explicit delimiters, punctuation burden | Simple visual blocks, indentation errors |
| AI-generated code | Familiar forms, line-break ambiguity risk | Deterministic punctuation repairs | Whitespace edits can change nesting |
| Compiler complexity | Moderate layout/control-head rules | Simplest termination rules | Indentation token stack and block/value rules |
| Runtime performance | No intrinsic difference | No intrinsic difference | No intrinsic difference |
| Interoperability | Familiar JS-ish braces, independent grammar | Familiar C-family statements | More visual distance from JS |
| Compatibility | Newline and contextual-token rules must stay stable | Semicolon omission later can be additive | Switching block forms is breaking |

## Accepted direction

Selected **A**, using narrowly specified restrictions rather than symbol-dependent parsing. Koda uses braces for structural clarity, significant statement newlines, no required semicolons, final block expressions, and minimal punctuation.

| Subchoice | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Newlines | Always terminate: simple/restrictive; token continuation: readable; delimiter-only continuation: explicit | End complete statements except in list/group delimiters or after an operator; nested block braces restore statement context |
| Tail value | Final expression: concise; explicit return: obvious; special yield: extra keyword | Final expression plus early return; empty blocks produce Unit; define discarded non-Result values explicitly |
| Record/control braces | Restrict unparenthesized record literals in heads: small; parenthesize all heads: noisy; constructor calls: grammar change | Restrict direct record literals in if/match heads; ordinary match value { ... } stays valid |
| Explicit generic call | f<T>: familiar/needs grammar discipline; f::<T>: unambiguous but Rust-like punctuation; f[T]: distinct/reserves indexing | **Accepted: `f<T>(...)`**; grammar/parser must resolve it deterministically without requiring Rust-style `::<...>` |
| Pattern names | Bare names bind, variants qualified: clear; uppercase convention: implicit rule; explicit binding keyword: verbose | Bare bindings; qualified variants except prelude Ok/Err; reject shadowing per Q11 |
| Identifiers | ASCII first: small; Unicode identifiers: inclusive/normalization rules; escaped identifiers: flexible | ASCII identifiers initially, UTF-8 strings/comments; Unicode identifier support deferred explicitly |
| Comments/string spelling | Existing escapes plus explicit interpolation delimiters: familiar; raw/multiline delimiters: readable; indentation-sensitive multiline form: concise/layout rules | Preserve simple comments provisionally; choose interpolation/multiline spelling and layout under Q01. Feature support is already accepted in Q11, not a deferral option |
| Keywords/namespaces | Fully reserved: stable/collisions; contextual: flexible/parser detail; extensible names: ambiguity | Reserve actual core words plus entity; contextual from; separate type/value namespaces, explicit collision rules for prelude names |
| Operators | Fixed precedence: teachable; all parenthesized: verbose; user overloading: complex | Current fixed table; non-associative comparisons, short-circuit booleans, statement-only assignment |

Before approval, resolve multiline calls, return followed by newline, nested record/block braces, generic-vs-comparison tokens, match catch-alls, and prelude shadowing. These are paper grammar/diagnostic cases, not permission to implement a parser.


## Accepted surface rules

### Blocks and statement termination

Braces delimit blocks. Semicolons are not required and are not part of the v0.1 ordinary statement syntax. A newline ends a complete statement except while inside grouping/list/call delimiters or when the preceding token requires continuation, such as a binary operator.

Formatting must make continued expressions visually clear. Nested braces establish block/statement context rather than acting as implicit expression continuation.

### Bindings

Immutable bindings are the default. Explicit `mut` marks a binding that may be rebound under Q03; it does not make ordinary fields mutable.

The accepted semantic shape is:

```koda
name = "Koda"

mut count = 0
count = count + 1
```

Whether an explicit `let` spelling is retained as an optional/required declaration form is rejected for the ordinary inferred-binding form: bare `name = value` introduces an immutable local when no binding of that name exists in the current scope. Reassignment is only valid for an existing `mut` binding. Q11's no-shadowing rule prevents this from becoming scope-dependent guessing.

### Functions and block values

Functions use `fn`, explicit parameter types, and an explicit return type. The final expression of a value-producing block is its value; `return expression` performs an early return. Empty blocks produce Unit.

```koda
fn greet(name: String) -> String {
    message = "Hello {name}"
    message
}
```

A newline immediately after bare `return` does not capture the following expression. Bare `return` is valid only where returning Unit is valid.

### Types and records

```koda
type User {
    name: String
    age: Int
    email: String?
}

user = User {
    name: "Ntlantla"
    age: 30
    email: null
}
```

Fields and record entries are newline-separated; commas may be used where the grammar permits list separators, including compact/multiline forms. Formatting chooses one canonical style.

Direct unparenthesized record literals are restricted where their braces would conflict with control-structure heads. Parentheses disambiguate such cases. Parsing must not consult the type table to decide whether braces are a record or block.

### Enums and match

```koda
enum PaymentStatus {
    Pending
    Paid(transactionId: String)
    Failed(reason: String)
}

match status {
    PaymentStatus.Pending => print("Waiting")
    PaymentStatus.Paid(id) => print("Paid {id}")
    PaymentStatus.Failed(reason) => print(reason)
}
```

Bare names in patterns bind values. User-defined enum variants are qualified. Prelude `Ok` and `Err` may be used unqualified. `_` is the catch-all pattern. Q11's no-shadowing restrictions apply to pattern bindings. Match remains exhaustive.

### Generics

Declarations and type references use angle brackets:

```koda
fn first<T>(items: List<T>) -> T? {
    ...
}
```

Explicit generic calls use the beginner-familiar form:

```koda
parse<Int>("42")
```

Koda does **not** require Rust-style `::<...>`. The grammar/parser must distinguish explicit generic calls from comparisons using syntactic context and bounded lookahead; it must not rely on AI intent or arbitrary symbol-table guesses. Where inference determines type arguments, explicit generic arguments should be unnecessary.

### Strings

Double-quoted strings support escapes and interpolation with braces:

```koda
name = "Killo"
message = "Hello {name}"
```

Interpolation uses `{ expression }` rather than JavaScript-style `${...}`. Literal braces require escaping under the string lexical rules.

Multiline strings use triple double quotes:

```koda
description = """
Welcome to Koda.

Build software that is readable,
safe, and easy to understand.
"""
```

The common indentation contributed by the source layout is removed from multiline content; relative indentation and intentional blank lines are preserved. The exact tab/space measurement algorithm must be deterministic and documented in the lexical spec before implementation.

### Comments

```koda
// single-line comment

/*
   block comment
*/
```

Block comments do not nest in v0.1. Comment markers inside strings are ordinary string content.

### Identifiers

v0.1 source files are UTF-8. Strings and comments support Unicode. Identifiers are ASCII initially: letters or underscore to start, followed by ASCII letters, digits, or underscores. Unicode identifiers are deferred so normalization/confusable policy can be designed deliberately.

### Keywords and contextual words

Core syntax words are reserved. `from` remains contextual in import syntax. `entity` remains reserved even though entity semantics are deferred. Prelude type/value names are not keywords, but declarations that would create prohibited ambiguity with prelude/core names receive a diagnostic according to the namespace rules.

### Operators

v0.1 retains the fixed precedence table: postfix calls/access, unary, multiplicative, additive, ordering, equality, logical AND, logical OR. Ordering/equality chains are non-associative. Boolean operators short-circuit. Assignment/rebinding is a statement, not an expression. User-defined operator overloading is not part of v0.1.

### Numeric lexical direction

Q02 semantics remain authoritative. v0.1 syntax supports decimal, binary, octal, and hexadecimal integer literals; `_` digit separators; decimal-point and exponent Float forms; and contextual literal typing. Leading-zero decimal text is not implicit octal. Decimal remains reserved but unusable.

The lexer/parser must preserve enough exact literal information for Q02's contextual typing, minimum-Int handling, and correctly rounded Float conversion. Special Float values are named values/APIs rather than dedicated literal grammar.

### Result handling

Q04 remains authoritative. v0.1 uses explicit `match`/return handling as the baseline. No implicit propagation exists. A concise propagation operator is not included in the initial syntax freeze; it may be proposed later only if its failure behavior remains visible and beginner-friendly.

## Ambiguity and beginner rules

The parser must decide syntax from tokens and grammar, not from AI intent. When a construct is genuinely ambiguous, Koda prefers a small explicit disambiguation rule over globally adding punctuation.

Diagnostics for syntax mistakes follow the beginner-first principle from ADR 0010: explain the concrete mistake, show the relevant location, and give a valid nearby form when the compiler can do so reliably.

This syntax freeze intentionally leaves room for additive future features, but future grammar must not reinterpret valid v0.1 programs.
