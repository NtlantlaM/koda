/**
 * The type lattice of the slice-1A subset.
 *
 * docs/spec/type-system.md lists `Bool`, `String`, `Int`, `Float` and `Unit` as
 * the primitives, and gives Koda-defined `type` and `enum` declarations
 * **nominal** identity: two declarations with identical fields are distinct
 * types, and no structural interchangeability follows from a matching shape.
 * That is why a record or enum type carries its declaration rather than its
 * shape, and why assignability compares declaration identity.
 *
 * `Never` is internal: it describes a block that always returns, so a diverging
 * branch stays compatible with its sibling. `Error` is the recovery type;
 * docs/architecture/compiler.md requires that it never reach emitted IR, which
 * the pipeline enforces by refusing to emit when any error was produced.
 */
import type { Span } from "../source/source.js";

/** A field of a record, or one named component of an enum variant payload. */
export interface FieldSymbol {
  readonly name: string;
  readonly type: KType;
  readonly declarationSpan: Span;
  /** Position in the declaration, used for deterministic ordering. */
  readonly index: number;
}

export interface RecordDeclaration {
  readonly id: number;
  readonly name: string;
  readonly nameSpan: Span;
  readonly exported: boolean;
  /** Declaration order. */
  readonly fields: FieldSymbol[];
  readonly fieldsByName: Map<string, FieldSymbol>;
}

export interface VariantSymbol {
  readonly name: string;
  readonly declarationSpan: Span;
  readonly index: number;
  /**
   * `null` for a variant declared without parentheses. An empty array means the
   * variant was written with an empty payload list.
   */
  readonly payload: FieldSymbol[] | null;
}

export interface EnumDeclaration {
  readonly id: number;
  readonly name: string;
  readonly nameSpan: Span;
  readonly exported: boolean;
  /** Declaration order. */
  readonly variants: VariantSymbol[];
  readonly variantsByName: Map<string, VariantSymbol>;
}

export type PrimitiveKind = "Bool" | "String" | "Int" | "Float" | "Unit" | "Never" | "Error";

export type KType =
  | { readonly kind: PrimitiveKind }
  | { readonly kind: "Record"; readonly declaration: RecordDeclaration }
  | { readonly kind: "Enum"; readonly declaration: EnumDeclaration };

export const BoolType: KType = { kind: "Bool" };
export const StringType: KType = { kind: "String" };
export const IntType: KType = { kind: "Int" };
export const FloatType: KType = { kind: "Float" };
export const UnitType: KType = { kind: "Unit" };
export const NeverType: KType = { kind: "Never" };
export const ErrorType: KType = { kind: "Error" };

export const PRIMITIVE_TYPES: ReadonlyMap<string, KType> = new Map([
  ["Bool", BoolType],
  ["String", StringType],
  ["Int", IntType],
  ["Float", FloatType],
  ["Unit", UnitType],
]);

export function recordType(declaration: RecordDeclaration): KType {
  return { kind: "Record", declaration };
}

export function enumType(declaration: EnumDeclaration): KType {
  return { kind: "Enum", declaration };
}

export function typeName(type: KType): string {
  if (type.kind === "Record" || type.kind === "Enum") return type.declaration.name;
  return type.kind === "Never" ? "Unit" : type.kind;
}

export function isNumeric(type: KType): boolean {
  return type.kind === "Int" || type.kind === "Float";
}

/**
 * Primitive equality is supported in v0.1. ADR 0007 defers derived equality for
 * user-defined value types, so records and enums have none yet.
 */
export function hasEquality(type: KType): boolean {
  return type.kind === "Bool" || type.kind === "String" || type.kind === "Int" || type.kind === "Float";
}

/** Nominal identity: the same declaration, not the same shape. */
function sameDeclaration(left: KType, right: KType): boolean {
  if (left.kind === "Record" && right.kind === "Record") {
    return left.declaration.id === right.declaration.id;
  }
  if (left.kind === "Enum" && right.kind === "Enum") {
    return left.declaration.id === right.declaration.id;
  }
  return false;
}

/**
 * There is no subtyping in this subset. `Error` absorbs to suppress cascades,
 * and `Never` (a block that always returns) fits any expected type.
 */
export function isAssignable(value: KType, expected: KType): boolean {
  if (value.kind === "Error" || expected.kind === "Error") return true;
  if (value.kind === "Never") return true;
  if (value.kind === "Record" || value.kind === "Enum") return sameDeclaration(value, expected);
  return value.kind === expected.kind;
}

/** The common type of two branches, or null when they disagree. */
export function unify(left: KType, right: KType): KType | null {
  if (left.kind === "Error") return right;
  if (right.kind === "Error") return left;
  if (left.kind === "Never") return right;
  if (right.kind === "Never") return left;
  if (left.kind === "Record" || left.kind === "Enum") {
    return sameDeclaration(left, right) ? left : null;
  }
  return left.kind === right.kind ? left : null;
}
