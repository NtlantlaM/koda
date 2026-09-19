# Q01: Concrete syntax and ambiguity

State: **AWAITING DECISION**. Selected option: **none**. All spellings remain proposals.
Resolve after Q11/Q02–Q04, then reconcile imports/foreign/test declarations before freeze.

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

## Recommendation, not acceptance

Recommend **A**, using narrowly specified restrictions rather than symbol-dependent parsing. All subchoices are **AWAITING DECISION**:

| Subchoice | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Newlines | Always terminate: simple/restrictive; token continuation: readable; delimiter-only continuation: explicit | End complete statements except in list/group delimiters or after an operator; nested block braces restore statement context |
| Tail value | Final expression: concise; explicit return: obvious; special yield: extra keyword | Final expression plus early return; empty blocks produce Unit; define discarded non-Result values explicitly |
| Record/control braces | Restrict unparenthesized record literals in heads: small; parenthesize all heads: noisy; constructor calls: grammar change | Restrict direct record literals in if/match heads; ordinary match value { ... } stays valid |
| Explicit generic call | f<T>: familiar/needs lookahead; f::<T>: unambiguous/punctuation; f[T]: distinct/reserves indexing | f::<T>(...) while declarations/types retain angle brackets |
| Pattern names | Bare names bind, variants qualified: clear; uppercase convention: implicit rule; explicit binding keyword: verbose | Bare bindings; qualified variants except prelude Ok/Err; reject shadowing per Q11 |
| Identifiers | ASCII first: small; Unicode identifiers: inclusive/normalization rules; escaped identifiers: flexible | ASCII identifiers initially, UTF-8 strings/comments; Unicode identifier support deferred explicitly |
| Comments/strings | Line comments/simple escapes: small; nested comments/raw strings: convenient; interpolation now: more grammar | Current simple set; no interpolation or nested block comments initially |
| Keywords/namespaces | Fully reserved: stable/collisions; contextual: flexible/parser detail; extensible names: ambiguity | Reserve actual core words plus entity; contextual from; separate type/value namespaces, explicit collision rules for prelude names |
| Operators | Fixed precedence: teachable; all parenthesized: verbose; user overloading: complex | Current fixed table; non-associative comparisons, short-circuit booleans, statement-only assignment |

Before approval, resolve multiline calls, return followed by newline, nested record/block braces, generic-vs-comparison tokens, match catch-alls, and prelude shadowing. These are paper grammar/diagnostic cases, not permission to implement a parser.
