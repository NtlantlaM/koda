# Syntax specification

> Q01 concrete syntax is **ACCEPTED** via [ADR 0011](../decisions/0011-q01-concrete-syntax.md). Later feature-specific syntax remains subject to its owning design question.

Status: **ACCEPTED** Q01 surface rules and explicit follow-ups. The older grammar sketch is incomplete; accepted sections and ADR 0011 take precedence. Implementation subsets are recorded separately.

## Lexical and layout rules

Proposed v0.1 rules: UTF-8 input; ASCII identifiers `[A-Za-z_][A-Za-z0-9_]*`; case-sensitive names; `//` line comments. Unicode is allowed in strings and comments. Unicode identifiers and nested block comments are deferred; non-nesting block comments are accepted.

The existing single-line proposal uses double quotes with `\n`, `\r`, `\t`, `\"`, and `\\` escapes. String interpolation and multiline strings are accepted by [Q11 / ADR 0007](../decisions/0007-q11-type-boundaries.md). ADR 0011 accepts interpolation braces and triple-quoted multiline strings; ADR 0011 specifies deterministic common-indentation removal; numeric formatting is fixed by [Q02](numbers.md); other interpolation conversion rules remain to be specified. The sketch below is incomplete for these accepted features and must not be treated as a frozen grammar. Q02 accepts decimal/binary/octal/hex integer magnitudes, digit separators, decimal-point/exponent Float forms, contextual literal typing, and direct negative-minimum formation. The accepted sign/parenthesis follow-up below governs direct negation; other lexical details remain subject to their recorded decisions. [Numeric semantics](numbers.md) fixes ranges, rounding, and non-finite values; this grammar sketch does not override them. Decimal is reserved but unusable in v0.1; its reservation mechanism remains Q01.

Newlines terminate statements, except inside parentheses, brackets, and record/call argument lists. A binary operator at the end of a line continues its expression. Braces delimit blocks. Commas separate fields, parameters, arguments, variants, and match arms; trailing commas are allowed. Semicolons are not part of the proposal. Final block expressions supply a value; `return expression` exits a function early. Nested block braces restore statement context under ADR 0011.

Proposed keywords: `as`, `else`, `entity`, `enum`, `export`, `false`, `fn`, `if`, `import`, `match`, `mut`, `null`, `return`, `true`, `type`. `entity` is reserved but unsupported in v0.1. `Result`, `Ok`, `Err`, and primitive type names are prelude names. Experimental concurrency and foreign declaration notation do not reserve additional v0.1 keywords yet.

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

`from` is a contextual token in imports. This historical sketch omits details now supplied by ADR 0011 and the accepted follow-ups below, including record/control-head disambiguation, block values and pattern forms. Consult the implementation slice documents for the supported subset.

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

### Nullable surface

Accepted 2026-09-21. A nullable type is written `T?`, with the suffix following
any type arguments, so a nullable list is `List<T>?`. Writing `T??` is rejected.
The absent value is the literal `null`, which is an expression where a nullable
type is expected and a pattern inside `match`:

```ko
type Profile {
    name: String
    nickname: String?
}

fn display(name: String?) -> String {
    match name {
        null => "Anonymous"
        value => value
    }
}
```

An explicit null check is written `x != null` or `x == null`. Equality and
inequality accept a nullable operand compared against `null`; that comparison is
an **absence test** and does not enable equality for the underlying type. `?`
remains a type suffix only, and no propagation operator is introduced.

Which bindings a check refines, and for how long, is a Q11 matter recorded in
[the type system](type-system.md#explicit-null-checks) and under "Accepted
follow-up details" in [ADR 0007](../decisions/0007-q11-type-boundaries.md).

## Q01 accepted lexical/surface additions

ADR 0011 accepts bare inferred immutable bindings, explicit `mut` rebinding declarations, braces with significant statement newlines, no required semicolons, final block values, `{expression}` string interpolation, triple-double-quoted multiline strings with deterministic common-indentation removal, `//` and non-nesting `/* ... */` comments, ASCII v0.1 identifiers in UTF-8 source, qualified user enum variants with prelude Ok/Err exceptions, and `_` catch-all patterns. Explicit generic calls use `f<T>(...)`; Rust-style turbofish is not Koda v0.1 syntax. Q04 uses explicit match/return handling; no propagation operator is in the initial syntax freeze.

## Generic data-type syntax (Slice 2A)

Status: **ACCEPTED**, explicit human clarification of Q01 on 2026-09-21.

```ko
type Pair<K, V> {
    first: K
    second: V
}

enum Choice<T> {
    First(value: T)
    None
}

type Triple<
    A,
    B,
    C,
> {
    first: A
    second: B
    third: C
}
```

Declaration parameter lists are nonempty, comma-separated, optionally trailing
comma, and multiline. `type Box<>` is invalid. Parameters occur directly after
the declaration name. No default parameters or bounds are introduced.

Type arguments are type descriptions, so `Pair<String, Int>`,
`Outer<Inner<Int>, String>`, `Box<Int?>` and `Box<Int>?` are type references.
The type-reference parser handles nested angle brackets; it does not parse them
as value comparisons. Empty/omitted/partial arguments and arguments on nongeneric
types are rejected. Exact arity and declaration-local names are Q11 semantics.

This type syntax does not introduce generic record/enum construction syntax.
Generic functions and explicit `f<T>(...)` calls remain outside Slice 2A;
accepted future calls must not be silently reinterpreted as comparison chains.
