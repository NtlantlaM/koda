/**
 * Syntax tree through Slice 2A.
 *
 * Every node carries its origin span. Numerals keep their exact source text so
 * ADR 0008's contextual literal typing can run in the checker rather than the
 * lexer.
 */
import type { Span } from "../source/source.js";

export interface TypeRef {
  readonly name: string;
  /** null means no angle brackets; [] preserves an explicitly empty application. */
  readonly arguments: readonly TypeRef[] | null;
  /** True when the reference carried a `?` suffix (ADR 0011 follow-up). */
  readonly nullable: boolean;
  readonly span: Span;
}

export interface TypeParameterDecl {
  readonly name: string;
  readonly span: Span;
}

export interface Parameter {
  readonly name: string;
  readonly nameSpan: Span;
  readonly type: TypeRef;
}

export interface FunctionDecl {
  readonly kind: "function";
  readonly exported: boolean;
  readonly name: string;
  readonly nameSpan: Span;
  /** `fn identity<T>(...)`. Empty when the function declares none (Slice 4A). */
  readonly typeParameters: readonly TypeParameterDecl[];
  readonly parameters: readonly Parameter[];
  readonly returnType: TypeRef;
  readonly body: Block;
  readonly span: Span;
}

export interface ImportDecl {
  readonly kind: "import";
  readonly names: readonly { readonly name: string; readonly span: Span }[];
  readonly moduleSpecifier: string;
  readonly moduleSpan: Span;
  readonly span: Span;
}

/** One `name: Type` entry in a `type` body or an enum variant payload. */
export interface FieldDecl {
  readonly name: string;
  readonly nameSpan: Span;
  readonly type: TypeRef;
  readonly span: Span;
}

export interface TypeDecl {
  readonly kind: "type";
  readonly exported: boolean;
  readonly name: string;
  readonly nameSpan: Span;
  readonly typeParameters: readonly TypeParameterDecl[];
  readonly fields: readonly FieldDecl[];
  readonly span: Span;
}

/**
 * A variant. `payload` is null when the variant is written without
 * parentheses, which is how `Pending` differs from a hypothetical `Pending()`.
 * Payload components are named, as the accepted Q01 proposal spells them:
 * `Paid(transactionId: String)`.
 */
export interface VariantDecl {
  readonly name: string;
  readonly nameSpan: Span;
  readonly payload: readonly FieldDecl[] | null;
  readonly span: Span;
}

export interface EnumDecl {
  readonly kind: "enum";
  readonly exported: boolean;
  readonly name: string;
  readonly nameSpan: Span;
  readonly typeParameters: readonly TypeParameterDecl[];
  readonly variants: readonly VariantDecl[];
  readonly span: Span;
}

export type Declaration = FunctionDecl | TypeDecl | EnumDecl;

export interface Module {
  readonly imports: readonly ImportDecl[];
  readonly declarations: readonly Declaration[];
}

export interface Block {
  readonly kind: "block";
  readonly statements: readonly Statement[];
  /** The final expression of a value-producing block (ADR 0011). */
  readonly tail: Expression | null;
  readonly span: Span;
}

/**
 * `[mut] name [: Type] = expression`, and bare `name = expression`.
 *
 * ADR 0011 makes bare `name = value` an immutable declaration when no binding
 * of that name exists, and a rebinding otherwise. Both spell the same tokens,
 * so the parser produces one node and the checker resolves the meaning against
 * the scope. That keeps the decision out of the grammar, which is what ADR
 * 0011's ambiguity rule requires.
 */
export interface BindStatement {
  readonly kind: "bind";
  readonly mutable: boolean;
  /** The `mut` keyword span, when present. */
  readonly mutSpan: Span | null;
  readonly name: string;
  readonly nameSpan: Span;
  readonly declaredType: TypeRef | null;
  readonly value: Expression;
  readonly span: Span;
}

export interface ReturnStatement {
  readonly kind: "return";
  readonly value: Expression | null;
  readonly span: Span;
}

export interface ExpressionStatement {
  readonly kind: "expression";
  readonly expression: Expression;
  readonly span: Span;
}

/**
 * `for binding in iterable { body }` (Slice 5).
 *
 * A statement, never a value. The iterable is parsed as a control head, so a
 * direct record literal is restricted there as in `if` and `match`.
 */
export interface ForStatement {
  readonly kind: "for";
  readonly name: string;
  readonly nameSpan: Span;
  readonly iterable: Expression;
  readonly body: Block;
  readonly span: Span;
}

export type Statement = BindStatement | ReturnStatement | ExpressionStatement | ForStatement;

export interface NumberLiteral {
  readonly kind: "number";
  /** "int" for an integer numeral, "float" for a decimal-point/exponent form. */
  readonly category: "int" | "float";
  /** Exact source text, separators included (ADR 0008 S15). */
  readonly raw: string;
  readonly span: Span;
}

export type StringLiteralPart =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "expr"; readonly expression: Expression };

export interface StringLiteral {
  readonly kind: "string";
  readonly parts: readonly StringLiteralPart[];
  readonly span: Span;
}

export interface BoolLiteral {
  readonly kind: "bool";
  readonly value: boolean;
  readonly span: Span;
}

/**
 * The absent value.
 *
 * It has no type of its own: the expected type supplies one, and an
 * unconstrained `null` is rejected because inference must not invent an unsafe
 * type (docs/spec/type-system.md).
 */
export interface NullLiteral {
  readonly kind: "null";
  readonly span: Span;
}

export interface NameExpression {
  readonly kind: "name";
  readonly name: string;
  readonly span: Span;
}

export interface CallExpression {
  readonly kind: "call";
  /** A plain name, or a member access such as `PaymentStatus.Paid`. */
  readonly callee: NameExpression | MemberExpression;
  /**
   * `identity<Int>(42)`. null means none were written; Slice 4A never infers
   * them, so a generic call without them is an error rather than a request.
   */
  readonly typeArguments: readonly TypeRef[] | null;
  readonly args: readonly Expression[];
  readonly span: Span;
}

/**
 * `target.name`.
 *
 * The same syntax reads a record field and names an enum variant. Which one it
 * is depends on whether the target resolves to a value or to a type, so the
 * parser produces one node and the checker decides - the grammar never has to
 * consult a symbol table, which is what ADR 0011's ambiguity rule requires.
 */
export interface MemberExpression {
  readonly kind: "member";
  readonly target: Expression;
  readonly name: string;
  readonly nameSpan: Span;
  /**
   * Type arguments written on the target, as in `Wrap<Int>.Has(42)`. Meaningful
   * only when `target` is a name that resolves to a generic enum; the checker
   * decides, because the grammar must not consult a symbol table (ADR 0011).
   * null means none were written.
   */
  readonly typeArguments: readonly TypeRef[] | null;
  readonly span: Span;
}

/** One `name: value` entry of a record literal. */
export interface FieldInit {
  readonly name: string;
  readonly nameSpan: Span;
  readonly value: Expression;
  readonly span: Span;
}

/**
 * `User { name: "Killo", age: 30 }`.
 *
 * ADR 0011 restricts direct record literals where their braces would collide
 * with a control-structure head, so the parser suppresses this form inside an
 * `if` condition rather than consulting the type table.
 */
export interface RecordExpression {
  readonly kind: "record";
  readonly typeName: string;
  readonly typeSpan: Span;
  /**
   * Type arguments written at the construction site, as in
   * `Box<Int> { value: 42 }`. null means none were written, in which case the
   * expected type supplies them (Slice 3A). An empty array preserves a written
   * `Box<>`, which is invalid.
   */
  readonly typeArguments: readonly TypeRef[] | null;
  readonly fields: readonly FieldInit[];
  readonly span: Span;
}

/**
 * `[a, b, c]` (Slice 5).
 *
 * Brackets are a grouping delimiter, so elements are comma-separated and a
 * newline inside them is not a separator. An empty list has no element type of
 * its own; the expected type supplies one.
 */
export interface ListExpression {
  readonly kind: "list";
  readonly elements: readonly Expression[];
  readonly span: Span;
}

export type UnaryOperator = "!" | "-";

export interface UnaryExpression {
  readonly kind: "unary";
  readonly operator: UnaryOperator;
  readonly operatorSpan: Span;
  readonly operand: Expression;
  readonly span: Span;
}

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||";

export interface BinaryExpression {
  readonly kind: "binary";
  readonly operator: BinaryOperator;
  readonly operatorSpan: Span;
  readonly left: Expression;
  readonly right: Expression;
  readonly span: Span;
}

export interface IfExpression {
  readonly kind: "if";
  readonly condition: Expression;
  readonly then: Block;
  readonly otherwise: Block | IfExpression | null;
  readonly span: Span;
}

/**
 * An explicitly parenthesised expression.
 *
 * Parentheses carry no value of their own, but they are not erased, because
 * ADR 0008's minimum-Int rule is stated in terms of a *directly* negated
 * numeral. `-9223372036854775808` is a valid Int; `-(9223372036854775808)` is
 * not, because the parenthesised positive literal must inhabit Int before the
 * negation applies.
 */
export interface ParenExpression {
  readonly kind: "paren";
  readonly expression: Expression;
  readonly span: Span;
}

/** `null`: matches the absent value of a nullable scrutinee. */
export interface NullPattern {
  readonly kind: "null-pattern";
  readonly span: Span;
}

/** `_`: matches anything and binds nothing. */
export interface WildcardPattern {
  readonly kind: "wildcard";
  readonly span: Span;
}

/**
 * A bare name in a pattern.
 *
 * ADR 0011 makes a bare name bind a value. This slice accepts one only inside a
 * payload list, where it names the extracted value; a bare name standing as a
 * whole arm is a binding catch-all, which is left to later work.
 */
export interface BindingPattern {
  readonly kind: "binding";
  readonly name: string;
  readonly span: Span;
}

/**
 * `PaymentStatus.Paid(id)`.
 *
 * User enum variants are qualified (ADR 0011). `payload` is null when the
 * pattern is written without parentheses.
 */
export interface VariantPattern {
  readonly kind: "variant-pattern";
  /**
   * null for the unqualified prelude form, `Ok(value)`. Ordinary user enum
   * variants stay qualified, so the checker rejects an unqualified pattern for
   * anything but Result.
   */
  readonly enumName: string | null;
  readonly enumSpan: Span;
  readonly variantName: string;
  readonly variantSpan: Span;
  readonly payload: readonly Pattern[] | null;
  readonly span: Span;
}

/** Placeholder produced by parser recovery; never reaches emitted IR. */
export interface ErrorPattern {
  readonly kind: "pattern-error";
  readonly span: Span;
}

export type Pattern = WildcardPattern | BindingPattern | VariantPattern | NullPattern | ErrorPattern;

export interface MatchArm {
  readonly pattern: Pattern;
  /** An expression body is wrapped as a block whose tail is that expression. */
  readonly body: Block;
  readonly span: Span;
}

/**
 * `match value { ... }`.
 *
 * ADR 0011 keeps `match value { ... }` valid, so the scrutinee is parsed as a
 * control head: a direct record literal is suppressed there, and the `{` that
 * follows opens the arm list.
 */
export interface MatchExpression {
  readonly kind: "match";
  readonly scrutinee: Expression;
  readonly arms: readonly MatchArm[];
  readonly span: Span;
}

/** Placeholder produced by parser recovery; never reaches emitted IR. */
export interface ErrorExpression {
  readonly kind: "error";
  readonly span: Span;
}

export type Expression =
  | NumberLiteral
  | StringLiteral
  | BoolLiteral
  | NullLiteral
  | NameExpression
  | CallExpression
  | UnaryExpression
  | BinaryExpression
  | IfExpression
  | ParenExpression
  | MemberExpression
  | RecordExpression
  | ListExpression
  | MatchExpression
  | ErrorExpression;
