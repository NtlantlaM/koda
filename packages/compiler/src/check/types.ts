/**
 * The type lattice through Slice 2A.
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

/**
 * Identifies a declaration across a whole compilation (Q05-A).
 *
 * A bare per-checker counter was not enough: it restarts at 0 in every checker,
 * so two modules' unrelated declarations would take the same number and
 * `sameType` would call them nominally equal. The module component makes the
 * identity safe before multi-source compilation exists to break it.
 *
 * Records, enums and functions all draw `local` from one per-module allocator,
 * so any of them can own generic parameters. Identity is compiler-internal: it
 * never reaches Koda source, diagnostics, emitted JavaScript or the runtime.
 */
export interface DeclarationId {
  readonly module: number;
  readonly local: number;
}

/** The canonical prelude module. `Result` lives here. */
export const PRELUDE_MODULE_ID = 0;

/**
 * The single user module this compiler still compiles.
 *
 * Q05-B replaces this constant with a graph-wide allocator; nothing else about
 * the representation changes when it does.
 */
export const ENTRY_MODULE_ID = 1;

/**
 * Structural equality. Identities are compared by value, never by reference,
 * so two separately constructed `{ module: 1, local: 2 }` are the same
 * declaration.
 */
export function sameDeclarationId(left: DeclarationId, right: DeclarationId): boolean {
  return left.module === right.module && left.local === right.local;
}

/** A deterministic string key, for the maps and caches that need one. */
export function declarationKey(id: DeclarationId): string {
  return `${id.module}:${id.local}`;
}

/** A field of a record, or one named component of an enum variant payload. */
export interface FieldSymbol {
  readonly name: string;
  readonly type: KType;
  readonly declarationSpan: Span;
  /** Position in the declaration, used for deterministic ordering. */
  readonly index: number;
}

export interface RecordDeclaration {
  readonly id: DeclarationId;
  readonly typeParameters: readonly TypeParameterSymbol[];
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
  readonly id: DeclarationId;
  readonly typeParameters: readonly TypeParameterSymbol[];
  readonly name: string;
  readonly nameSpan: Span;
  readonly exported: boolean;
  /** Declaration order. */
  readonly variants: VariantSymbol[];
  readonly variantsByName: Map<string, VariantSymbol>;
}

export type PrimitiveKind = "Bool" | "String" | "Int" | "Float" | "Unit" | "Never" | "Error";

/** A binder is identified by its declaration and source-order position, not spelling. */
export interface TypeParameterSymbol {
  readonly ownerId: DeclarationId;
  readonly index: number;
  readonly name: string;
  readonly declarationSpan: Span;
}

export type KType =
  | { readonly kind: PrimitiveKind }
  | { readonly kind: "Record"; readonly declaration: RecordDeclaration; readonly arguments: readonly KType[] }
  | { readonly kind: "Enum"; readonly declaration: EnumDeclaration; readonly arguments: readonly KType[] }
  | { readonly kind: "TypeParameter"; readonly parameter: TypeParameterSymbol }
  /** `T?`. `inner` is never itself nullable: written `T??` is rejected. */
  | { readonly kind: "Nullable"; readonly inner: KType };

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

export function recordType(declaration: RecordDeclaration, args: readonly KType[] = []): KType {
  return { kind: "Record", declaration, arguments: args };
}

export function enumType(declaration: EnumDeclaration, args: readonly KType[] = []): KType {
  return { kind: "Enum", declaration, arguments: args };
}

/**
 * `T?`.
 *
 * ADR 0007 rejects written `T??` and keeps one observable absence layer, so a
 * nullable of a nullable collapses rather than nesting. The parser reports the
 * written form; this guard keeps the invariant for every other construction.
 */
export function nullableType(inner: KType): KType {
  if (inner.kind === "Nullable") return inner;
  return { kind: "Nullable", inner };
}

export function isNullable(type: KType): boolean {
  return type.kind === "Nullable";
}

/** The non-null type inside `T?`, or the type itself when it is not nullable. */
export function withoutNull(type: KType): KType {
  return type.kind === "Nullable" ? type.inner : type;
}

export function typeName(type: KType): string {
  if (type.kind === "Nullable") return `${typeName(type.inner)}?`;
  if (type.kind === "TypeParameter") return type.parameter.name;
  if (type.kind === "Record" || type.kind === "Enum") {
    return type.declaration.name + (type.arguments.length ? `<${type.arguments.map(typeName).join(", ")}>` : "");
  }
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
export function sameType(left: KType, right: KType): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "Nullable" && right.kind === "Nullable") return sameType(left.inner, right.inner);
  if (left.kind === "TypeParameter" && right.kind === "TypeParameter") {
    return sameDeclarationId(left.parameter.ownerId, right.parameter.ownerId) && left.parameter.index === right.parameter.index;
  }
  if ((left.kind === "Record" || left.kind === "Enum") && (right.kind === "Record" || right.kind === "Enum")) {
    return sameDeclarationId(left.declaration.id, right.declaration.id) && left.arguments.length === right.arguments.length &&
      left.arguments.every((argument, index) => sameType(argument, right.arguments[index]!));
  }
  return true;
}

/** Substitute only syntax-sized type trees; never expand declaration members. */
export function substitute(type: KType, ownerId: DeclarationId, args: readonly KType[]): KType {
  if (type.kind === "TypeParameter") {
    return sameDeclarationId(type.parameter.ownerId, ownerId) ? args[type.parameter.index] ?? ErrorType : type;
  }
  if (type.kind === "Nullable") return nullableType(substitute(type.inner, ownerId, args));
  if (type.kind === "Record") return recordType(type.declaration, type.arguments.map((arg) => substitute(arg, ownerId, args)));
  if (type.kind === "Enum") return enumType(type.declaration, type.arguments.map((arg) => substitute(arg, ownerId, args)));
  return type;
}

export function instantiatedField(field: FieldSymbol, ownerId: DeclarationId, args: readonly KType[]): FieldSymbol {
  return { ...field, type: substitute(field.type, ownerId, args) };
}

/**
 * There is no subtyping in this subset. `Error` absorbs to suppress cascades,
 * and `Never` (a block that always returns) fits any expected type.
 */
export function isAssignable(value: KType, expected: KType): boolean {
  if (value.kind === "Error" || expected.kind === "Error") return true;
  if (value.kind === "Never") return true;
  // `T` may be used where `T?` is expected; the reverse requires a check.
  if (expected.kind === "Nullable") {
    const inner = value.kind === "Nullable" ? value.inner : value;
    return isAssignable(inner, expected.inner);
  }
  if (value.kind === "Nullable") return false;
  return sameType(value, expected);
}

/** The common type of two branches, or null when they disagree. */
export function unify(left: KType, right: KType): KType | null {
  if (left.kind === "Error") return right;
  if (right.kind === "Error") return left;
  if (left.kind === "Never") return right;
  if (right.kind === "Never") return left;
  // docs/spec/type-system.md allows explicit nullable injection between arms,
  // so `T` and `T?` agree at `T?`. Nothing else widens.
  if (left.kind === "Nullable" || right.kind === "Nullable") {
    const merged = unify(withoutNull(left), withoutNull(right));
    return merged === null ? null : nullableType(merged);
  }
  return sameType(left, right) ? left : null;
}
