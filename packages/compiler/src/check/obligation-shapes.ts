/** Static stored-member shapes. No runtime identity, aliasing or effects. */
import { declarationKey, instantiatedField, sameDeclarationId, type DeclarationId, type KType } from "./types.js";
export interface Shape {
  readonly type: KType;
  readonly kind: "empty" | "record" | "enum" | "nullable" | "collection";
  readonly acknowledgment: boolean;
  readonly children: ReadonlyMap<string, { readonly label: string; readonly shape: Shape }>;
  readonly alternatives: readonly string[];
  readonly bears: boolean;
}
export const fieldKey = (index: number): string => "f" + index;
export const variantKey = (index: number): string => "v" + index;
export const payloadKey = (variant: number, index: number): string => variantKey(variant) + ":p" + index;
/** The one child standing for every element of a list (Slice 5). */
export const ELEMENT_KEY = "e";

/** Caches instantiated shapes, not declaration-only shapes or runtime values. */
export class Shapes {
  private readonly cache = new Map<string, Shape>();
  constructor(private readonly resultId: DeclarationId, private readonly listId: DeclarationId | null = null) {}
  private key(type: KType): string {
    if (type.kind === "Nullable") return this.key(type.inner) + "?";
    if (type.kind === "Record" || type.kind === "Enum") return type.kind + declarationKey(type.declaration.id) + "<" + type.arguments.map(t => this.key(t)).join(",") + ">";
    if (type.kind === "TypeParameter") return "P" + declarationKey(type.parameter.ownerId) + ":" + type.parameter.index;
    return type.kind;
  }
  of(type: KType): Shape {
    const key = this.key(type), cached = this.cache.get(key);
    if (cached) return cached;
    const children = new Map<string, { label: string; shape: Shape }>();
    let kind: Shape["kind"] = "empty", acknowledgment = false;
    let alternatives: string[] = [];
    if (type.kind === "Nullable") {
      kind = "nullable";
      const present = this.of(type.inner);
      children.set("present", { label: "", shape: present });
      alternatives = ["null", "present"];
      acknowledgment = present.bears;
    } else if (type.kind === "Record" && this.listId !== null && sameDeclarationId(type.declaration.id, this.listId)) {
      // Slice 5: a list has as many elements at runtime as it has, so one child
      // stands for all of them collectively. A finite literal and a returned
      // list must use the same representation, so elements are never enumerated.
      kind = "collection";
      children.set(ELEMENT_KEY, { label: "[]", shape: this.of(type.arguments[0] ?? { kind: "Error" }) });
    } else if (type.kind === "Record") {
      kind = "record";
      for (const field of type.declaration.fields) children.set(fieldKey(field.index), {
        label: "." + field.name,
        shape: this.of(instantiatedField(field, type.declaration.id, type.arguments).type),
      });
    } else if (type.kind === "TypeParameter") {
      // Slice 4A, ADR 0010: a generic body cannot see whether T is a Result, so
      // it conservatively carries an opaque responsibility. No children, because
      // nothing is known to be stored inside it; no alternatives, because there
      // is nothing a match could expose - which is exactly why a T can be
      // transferred but never handled.
      acknowledgment = true;
    } else if (type.kind === "Enum") {
      kind = "enum";
      acknowledgment = sameDeclarationId(type.declaration.id, this.resultId);
      alternatives = type.declaration.variants.map(v => variantKey(v.index));
      for (const variant of type.declaration.variants) for (const field of variant.payload ?? []) children.set(payloadKey(variant.index, field.index), {
        label: "." + variant.name + "." + field.name,
        shape: this.of(instantiatedField(field, type.declaration.id, type.arguments).type),
      });
    }
    const shape: Shape = { type, kind, acknowledgment, children, alternatives, bears: acknowledgment || [...children.values()].some(c => c.shape.bears) };
    this.cache.set(key, shape);
    return shape;
  }
}
