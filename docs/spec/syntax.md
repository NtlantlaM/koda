# Syntax specification proposal

> Q01 concrete syntax is **ACCEPTED** via [ADR 0011](../decisions/0011-q01-concrete-syntax.md). Later feature-specific syntax remains subject to its owning design question.

Status: **EXPERIMENTAL** concrete syntax, pending Q01. The examples consistently use this proposal. This is a bounded grammar sketch, not yet a complete parser contract.

## Lexical and layout rules

Proposed v0.1 rules: UTF-8 input; ASCII identifiers `[A-Za-z_][A-Za-z0-9_]*`; case-sensitive names; `//` line comments. Unicode is allowed in strings and comments. Unicode identifiers and block comments are LATER.

The existing single-line proposal uses double quotes with `\n`, `\r`, `\t`, `\"`, and `\\` escapes. String interpolation and multiline strings are accepted by [Q11 / ADR 0007](../decisions/0007-q11-type-boundaries.md). Q01 remains AWAITING DECISION for their delimiters, interpolation markers, escaping, and multiline indentation/newline rules; numeric formatting is fixed by [Q02](numbers.md); other interpolation conversion rules remain to be specified. The sketch below is incomplete for these accepted features and must not be treated as a frozen grammar. Q02 accepts decimal/binary/octal/hex integer magnitudes, digit separators, decimal-point/exponent Float forms, contextual literal typing, and direct negative-minimum formation. Their exact lexical/sign/parenthesis grammar remains Q01. [Numeric semantics](numbers.md) fixes ranges, rounding, and non-finite values; this grammar sketch does not override them. Decimal is reserved but unusable in v0.1; its reservation mechanism remains Q01.

Newlines terminate statements, except inside parentheses, brackets, and record/call argument lists. A binary operator at the end of a line continues its expression. Braces delimit blocks. Commas separate fields, parameters, arguments, variants, and match arms; trailing commas are allowed. Semicolons are not part of the proposal. Final block expressions supply a value; `return expression` exits a function early. Precise newline handling in nested braces must be formalized in Q01.

Proposed keywords: `as`, `else`, `entity`, `enum`, `export`, `false`, `fn`, `if`, `import`, `let`, `match`, `mut`, `null`, `return`, `true`, `type`. `entity` is reserved but unsupported in v0.1. `Result`, `Ok`, `Err`, and primitive type names are prelude names. Experimental concurrency and foreign declaration notation do not reserve additional v0.1 keywords yet.

## Declaration and expression sketch

```ebnf
module       = { importDecl | [ "export" ] declaration } ;
importDecl   = "import", "{", nameList, "}", "from", string ;
declaration  = typeDecl | enumDecl | functionDecl ;
typeDecl     = "type", identifier, [ typeParams ], "{", fields, "}" ;
enumDecl     = "enum", identifier, [ typeParams ], "{", variants, "}" ;
functionDecl = "fn", identifier, [ typeParams ], "(", parameters, ")",
               "->", typeRef, block ;
typeRef      = identifier, [ "<", typeArgs, ">" ], [ "?" ] ;
binding      = [ "mut" ], identifier, [ ":", typeRef ], "=", expression ;
assignment   = identifier, "=", expression ;
record       = identifier, "{", fieldValues, "}" ;
matchExpr    = "match", expression, "{", matchArms, "}" ;
matchArm     = pattern, "=>", ( expression | block ) ;
pattern      = "_" | "null" | "true" | "false" | identifier
             | qualifiedVariant, [ "(", patterns, ")" ] ;
```

`from` is a contextual token in imports. List productions, expression grammar, blocks, assignment restrictions, and identifier-versus-pattern resolution require completion before a parser is implemented. An identifier followed by `{` must be disambiguated between a record literal and the body of `if`/`match`; Q01 explicitly covers this.

```ko
type Person {
    name: String,
    nickname: String?,
}

enum GreetingError {
    MissingName,
    InvalidName(name: String),
}

fn greeting(person: Person) -> Result<String, GreetingError> {
    if person.name == "" {
        Err(GreetingError.MissingName)
    } else {
        Ok("Hello, " + person.name)
    }
}
```

Record construction supplies every field explicitly; nullable fields are not automatically omitted. Variant constructors are qualified by enum name, except prelude `Ok` and `Err`. No constructor call writes to a database.

## Operators (highest to lowest)

| Level | Operators | Associativity |
| --- | --- | --- |
| Postfix | call `(...)`, field/variant access `.` | Left |
| Unary | `!`, unary `-` | Right |
| Multiplicative | `*`, `/`, `%` | Left |
| Additive | `+`, `-` | Left |
| Ordering | `<`, `<=`, `>`, `>=` | Non-associative |
| Equality | `==`, `!=` | Non-associative |
| Logical AND | `&&` | Left, short-circuit |
| Logical OR | `||` | Left, short-circuit |

Assignment is a statement, not an expression. `?` is a type suffix only; no propagation operator is proposed for v0.1. Generic call arguments use the accepted `name<Type>(...)` form. The parser resolves this form syntactically without Rust-style `::<...>` or symbol-dependent guessing. `+` accepts matching numeric operands or two strings; it never converts between them.

`if` expressions require `else` when their value is used. `match` is an expression and must be exhaustive. Both constructs require compatible branch types. Match guards, destructuring records, loops, closures, and expression-bodied functions are outside this initial syntax subset.

## Accepted numeric constraints on the grammar sketch

[Q02](numbers.md) accepts Int addition/subtraction/multiplication/division/remainder and unary negation; Float addition/subtraction/multiplication/division and unary negation. Numeric equality/ordering require matching typed operands. The proposed precedence table does not authorize Float remainder, power, or implicit mixed-type conversions. Numeric literal bases and exponent forms are accepted features, but precise tokens and API names remain Q01. Required constant-expression contexts and ordinary unreachable-code diagnostics must be specified separately; neither is defined by this sketch.


## Q01 follow-up details (accepted)

Status: **ACCEPTED**. Approver: repository owner/user, by explicit instruction,
2026-09-20. These fill in two details that [ADR 0011](../decisions/0011-q01-concrete-syntax.md)
and [ADR 0008](numbers.md) expressly delegated to the string lexical rules and
to Q01. They add no new construct and change no accepted semantics.

### String escapes

A double-quoted string supports `\n`, `\r`, `\t`, `\"` and `\\`.

Interpolation uses `{expression}`. A **literal** interpolation brace is written
`\{` or `\}`:

```ko
greeting = "Hello {name}"
template = "Use \{name\} literally"
```

Both braces have an escape so that neither has to be inferred from context. An
unrecognised escape is a lexical error rather than the escaped character.

### Directly negated numerals and parentheses

[Numeric semantics](numbers.md) permits the signed minimum to be formed by
negating its magnitude directly. "Directly" means the numeral is the immediate
operand of the unary minus, with no parentheses between them:

```ko
smallest = -9223372036854775808      // valid Int
also     = -0x8000000000000000       // valid Int, any supported base
```

Parentheses end that adjacency. The parenthesised expression must inhabit its
type on its own, before the negation applies, so the positive magnitude is
rejected exactly as a bare one would be:

```ko
// invalid: 9223372036854775808 is not a valid Int on its own
bad = -(9223372036854775808)
```

Negating an already typed minimum Int is an ordinary checked arithmetic fault,
not a literal rule:

```ko
// compiles; faults at run time
worse = -(-9223372036854775808)
```

### Special Float values are not literal syntax

`NaN` and the infinities have **no literal spelling**. ADR 0008 S07 exposes them
through named values and predicates whose spelling remains deferred, so a source
program cannot write them as tokens and the grammar reserves nothing for them.

A finite numeral that overflows is a separate matter and remains accepted: it
rounds to a signed infinity as a *value*, per ADR 0008 S06.

### Enum payloads: named declaration, positional construction

Accepted 2026-09-21. A variant declares each payload value with a name and a
type. Construction supplies the values **in declaration order**, without labels:

```ko
enum PaymentStatus {
    Pending
    Paid(transactionId: String)
    Failed(reason: String)
}

paid = PaymentStatus.Paid("tx-42")
failed = PaymentStatus.Failed("Declined")
```

The declared name documents and identifies the payload field. It is **not an
argument label**, and this introduces no named or labelled argument form, here
or in any other call. A variant declared without parentheses takes no values and
is written bare, as `PaymentStatus.Pending`.

A payload pattern binds fresh names, which need not match the declared field
name:

```ko
PaymentStatus.Paid(id) => ...
```

The remaining details of patterns belong to the work that introduces `match`.

The positional payload *declaration* shown in the pre-Q01 grammar sketch earlier
in this document was stale and has been corrected; the named form above is
authoritative.

## Q01 accepted lexical/surface additions

ADR 0011 accepts bare inferred immutable bindings, explicit `mut` rebinding declarations, braces with significant statement newlines, no required semicolons, final block values, `{expression}` string interpolation, triple-double-quoted multiline strings with deterministic common-indentation removal, `//` and non-nesting `/* ... */` comments, ASCII v0.1 identifiers in UTF-8 source, qualified user enum variants with prelude Ok/Err exceptions, and `_` catch-all patterns. Explicit generic calls use `f<T>(...)`; Rust-style turbofish is not Koda v0.1 syntax. Q04 uses explicit match/return handling; no propagation operator is in the initial syntax freeze.
