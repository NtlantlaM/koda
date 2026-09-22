/**
 * Typed intermediate representation.
 *
 * docs/architecture/compiler.md requires that every expression carries a type
 * and an origin span, and that names reference symbols rather than strings.
 * Operator nodes are already split by operand type, so the emitter does not
 * re-derive which `+` is integer addition and which is string concatenation.
 * Checked integer operations keep their span because ADR 0008 requires
 * source-located arithmetic faults.
 */
import type { Span } from "../source/source.js";
import type { DeclarationId, EnumDeclaration, FieldSymbol, KType, RecordDeclaration, TypeParameterSymbol, VariantSymbol } from "../check/types.js";

export interface LocalSymbol {
  readonly id: number;
  readonly name: string;
  readonly type: KType;
  readonly mutable: boolean;
  readonly declarationSpan: Span;
}

export type FunctionOrigin =
  | { readonly kind: "declared"; readonly exported: boolean }
  /** A standard library function provided by the runtime, e.g. `koda:io` print. */
  | { readonly kind: "builtin"; readonly runtimeName: string };

export interface FunctionSymbol {
  readonly id: number;
  /**
   * Q05-A: the function's declaration identity, from the same per-module
   * allocator records and enums use. It exists so a function can own generic
   * parameters in Slice 4A; nothing reads it yet.
   */
  readonly declarationId: DeclarationId;
  /** `fn identity<T>(...)`; empty for an ordinary function (Slice 4A). */
  readonly typeParameters: readonly TypeParameterSymbol[];
  readonly name: string;
  readonly parameters: readonly LocalSymbol[];
  readonly returnType: KType;
  readonly origin: FunctionOrigin;
  readonly declarationSpan: Span;
}

export interface IRBlock {
  readonly statements: readonly IRStatement[];
  readonly tail: IRExpression | null;
  readonly type: KType;
  readonly span: Span;
}

export interface IRDeclare {
  readonly kind: "declare";
  readonly symbol: LocalSymbol;
  readonly value: IRExpression;
  readonly span: Span;
}

export interface IRAssign {
  readonly kind: "assign";
  readonly symbol: LocalSymbol;
  readonly value: IRExpression;
  readonly span: Span;
}

export interface IREval {
  readonly kind: "eval";
  readonly value: IRExpression;
  readonly span: Span;
}

export interface IRReturn {
  readonly kind: "return";
  readonly value: IRExpression | null;
  readonly span: Span;
}

/**
 * `for binding in iterable { body }` (Slice 5).
 *
 * The body is analysed once. Flows that reach its end are the loop's normal
 * completion edge, which is the only place the iterable's collective element
 * responsibility may be discharged (ADR 0010, R1/R3).
 */
export interface IRFor extends IRNode {
  readonly kind: "for";
  readonly binding: LocalSymbol;
  readonly iterable: IRExpression;
  readonly body: IRBlock;
}

export type IRStatement = IRDeclare | IRAssign | IREval | IRReturn | IRFor;

interface IRNode {
  readonly type: KType;
  readonly span: Span;
}

export interface IRIntConst extends IRNode {
  readonly kind: "int";
  readonly value: bigint;
}

export interface IRFloatConst extends IRNode {
  readonly kind: "float";
  readonly value: number;
}

export interface IRStringConst extends IRNode {
  readonly kind: "string";
  readonly value: string;
}

export interface IRBoolConst extends IRNode {
  readonly kind: "bool";
  readonly value: boolean;
}

/** The absent value. Its type comes from the context that accepted it. */
export interface IRNullConst extends IRNode {
  readonly kind: "null";
}

/**
 * `x != null` / `x == null`.
 *
 * An absence test, not ordinary equality: ADR 0007 keeps this separate so that
 * comparing a `User?` with null never implies `User == User`.
 */
export interface IRNullTest extends IRNode {
  readonly kind: "null-test";
  readonly operand: IRExpression;
  /** true for `!=`, false for `==`. */
  readonly negated: boolean;
}

export interface IRLocalRef extends IRNode {
  readonly kind: "local";
  readonly symbol: LocalSymbol;
}

/** `[a, b, c]`. Elements evaluate left to right, exactly once each. */
export interface IRList extends IRNode {
  readonly kind: "list";
  readonly elements: readonly IRExpression[];
}

/** The list operations the compiler knows: `length`, `isEmpty`, `get`. */
export type ListOperation = "length" | "isEmpty" | "get";

/**
 * A compiler-known list operation (Slice 5).
 *
 * Deliberately not an `IRCall`: a call transfers its arguments, which would
 * discharge the receiver's whole collective responsibility on a single `get`.
 * A separate node lets the obligation pass read the receiver without consuming
 * it (ADR 0010, R2).
 */
export interface IRListOp extends IRNode {
  readonly kind: "list-op";
  readonly operation: ListOperation;
  readonly target: IRExpression;
  /** Present only for `get`. */
  readonly index: IRExpression | null;
}

export interface IRCall extends IRNode {
  readonly kind: "call";
  readonly target: FunctionSymbol;
  /**
   * Resolved type arguments, parallel to `target.typeParameters`. Present for
   * the obligation pass; the emitter ignores them, because type arguments have
   * no runtime representation.
   */
  readonly typeArguments: readonly KType[];
  readonly args: readonly IRExpression[];
}

export type IntArithOperator = "+" | "-" | "*" | "/" | "%";
export type FloatArithOperator = "+" | "-" | "*" | "/";
export type CompareOperator = "<" | "<=" | ">" | ">=";

/** Checked signed 64-bit arithmetic; faults are located at `span`. */
export interface IRIntArith extends IRNode {
  readonly kind: "int-arith";
  readonly operator: IntArithOperator;
  readonly left: IRExpression;
  readonly right: IRExpression;
}

export interface IRIntNegate extends IRNode {
  readonly kind: "int-negate";
  readonly operand: IRExpression;
}

/** binary64 arithmetic; overflow, NaN and signed zero are ordinary results. */
export interface IRFloatArith extends IRNode {
  readonly kind: "float-arith";
  readonly operator: FloatArithOperator;
  readonly left: IRExpression;
  readonly right: IRExpression;
}

export interface IRFloatNegate extends IRNode {
  readonly kind: "float-negate";
  readonly operand: IRExpression;
}

export interface IRConcat extends IRNode {
  readonly kind: "concat";
  readonly left: IRExpression;
  readonly right: IRExpression;
}

export interface IREqual extends IRNode {
  readonly kind: "equal";
  readonly operandType: KType;
  readonly negated: boolean;
  readonly left: IRExpression;
  readonly right: IRExpression;
}

export interface IRCompare extends IRNode {
  readonly kind: "compare";
  readonly operandType: KType;
  readonly operator: CompareOperator;
  readonly left: IRExpression;
  readonly right: IRExpression;
}

export interface IRLogical extends IRNode {
  readonly kind: "logical";
  readonly operator: "&&" | "||";
  readonly left: IRExpression;
  readonly right: IRExpression;
}

export interface IRNot extends IRNode {
  readonly kind: "not";
  readonly operand: IRExpression;
}

export interface IRIf extends IRNode {
  readonly kind: "if";
  readonly condition: IRExpression;
  readonly then: IRBlock;
  readonly otherwise: IRBlock | null;
}

/** One field of a record construction, kept in **source** order. */
export interface IRFieldInit {
  readonly field: FieldSymbol;
  readonly value: IRExpression;
}

/**
 * `User { ... }`.
 *
 * Entries stay in the order they were written, because docs/spec/language.md
 * requires expressions to evaluate left to right; the declaration order is
 * available through `declaration.fields` when a stable layout is wanted.
 */
export interface IRRecordConstruct extends IRNode {
  readonly kind: "record";
  readonly declaration: RecordDeclaration;
  readonly entries: readonly IRFieldInit[];
}

export interface IRFieldAccess extends IRNode {
  readonly kind: "field";
  readonly target: IRExpression;
  readonly field: FieldSymbol;
}

/** `Status.Pending`, or `Status.Paid(transactionId: ...)`. */
export interface IRVariantConstruct extends IRNode {
  readonly kind: "variant";
  readonly declaration: EnumDeclaration;
  readonly variant: VariantSymbol;
  /** Positional, matching `variant.payload` order. */
  readonly args: readonly IRExpression[];
}

/**
 * One arm. `variant` is null for the `_` catch-all.
 *
 * `bindings` runs parallel to `variant.payload`; an entry is null where the
 * pattern wrote `_` and nothing needs extracting.
 */
export interface IRMatchArm {
  readonly variant: VariantSymbol | null;
  readonly bindings: readonly (LocalSymbol | null)[];
  readonly body: IRBlock;
  readonly span: Span;
}

/**
 * `match value { ... }`.
 *
 * The checker has already proved the arms exhaustive over `declaration`, so
 * lowering needs no default case. docs/architecture/compiler.md requires the
 * scrutinee to be evaluated exactly once, which the emitter does by binding it
 * to a temporary before testing any arm.
 */
export interface IRMatch extends IRNode {
  readonly kind: "match";
  readonly scrutinee: IRExpression;
  readonly declaration: EnumDeclaration;
  readonly arms: readonly IRMatchArm[];
}

/** One arm of a nullable match: the `null` case, or the catch-all binding. */
export interface IRNullableArm {
  readonly test: "null" | "catch-all";
  /** The bound non-null local, or null for `_` and for the `null` arm. */
  readonly binding: LocalSymbol | null;
  readonly body: IRBlock;
  readonly span: Span;
}

/**
 * `match x { null => ..., value => ... }`.
 *
 * Slice 1C restricts a nullable match to a `null` arm and a catch-all, so the
 * scrutinee needs only one test. It is still bound to a temporary first, so a
 * side-effecting scrutinee runs exactly once.
 */
export interface IRNullableMatch extends IRNode {
  readonly kind: "nullable-match";
  readonly scrutinee: IRExpression;
  readonly arms: readonly IRNullableArm[];
}

export type IRInterpolationPart =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "value"; readonly value: IRExpression };

export interface IRInterpolate extends IRNode {
  readonly kind: "interpolate";
  readonly parts: readonly IRInterpolationPart[];
}

export type IRExpression =
  | IRIntConst
  | IRFloatConst
  | IRStringConst
  | IRBoolConst
  | IRLocalRef
  | IRCall
  | IRList
  | IRListOp
  | IRIntArith
  | IRIntNegate
  | IRFloatArith
  | IRFloatNegate
  | IRConcat
  | IREqual
  | IRCompare
  | IRLogical
  | IRNot
  | IRIf
  | IRInterpolate
  | IRRecordConstruct
  | IRFieldAccess
  | IRVariantConstruct
  | IRMatch
  | IRNullConst
  | IRNullTest
  | IRNullableMatch;

export interface IRFunction {
  readonly symbol: FunctionSymbol;
  readonly body: IRBlock;
}

export interface IRModule {
  readonly path: string;
  readonly functions: readonly IRFunction[];
  /** The exported `main` entry, when the module declares one. */
  readonly entry: FunctionSymbol | null;
  /**
   * Declaration identity of the prelude `Result`, so the obligation pass can
   * recognise it without re-deriving the prelude. Canonical across the whole
   * compilation since Q05-A.
   */
  readonly resultDeclarationId: DeclarationId | null;
  /** Declaration identity of the prelude `List`, for the collective element shape. */
  readonly listDeclarationId: DeclarationId | null;
}
