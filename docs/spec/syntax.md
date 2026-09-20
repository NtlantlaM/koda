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
    InvalidName(String),
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


## Q01 accepted lexical/surface additions

ADR 0011 accepts bare inferred immutable bindings, explicit `mut` rebinding declarations, braces with significant statement newlines, no required semicolons, final block values, `{expression}` string interpolation, triple-double-quoted multiline strings with deterministic common-indentation removal, `//` and non-nesting `/* ... */` comments, ASCII v0.1 identifiers in UTF-8 source, qualified user enum variants with prelude Ok/Err exceptions, and `_` catch-all patterns. Explicit generic calls use `f<T>(...)`; Rust-style turbofish is not Koda v0.1 syntax. Q04 uses explicit match/return handling; no propagation operator is in the initial syntax freeze.
