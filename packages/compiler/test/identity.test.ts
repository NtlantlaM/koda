/**
 * Q05-A: declaration identity.
 *
 * These are compiler-level tests on purpose. Koda source cannot yet declare two
 * modules, so no `.ko` fixture can construct the collision this slice exists to
 * prevent. The identities below are built directly.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  ENTRY_MODULE_ID,
  PRELUDE_MODULE_ID,
  declarationKey,
  enumType,
  instantiatedField,
  isAssignable,
  recordType,
  sameDeclarationId,
  sameType,
  substitute,
  typeName,
  type DeclarationId,
  type EnumDeclaration,
  type FieldSymbol,
  type KType,
  type RecordDeclaration,
  type TypeParameterSymbol,
} from "../src/check/types.js";
import { build, check, renderJson, spanFrom } from "../src/index.js";

const span = spanFrom("identity.ko", 0, 0);

function parameter(ownerId: DeclarationId, index: number, name = "T"): TypeParameterSymbol {
  return { ownerId, index, name, declarationSpan: span };
}

function parameterType(symbol: TypeParameterSymbol): KType {
  return { kind: "TypeParameter", parameter: symbol };
}

/** A record named `name` with one field `value: T`, owned by `id`. */
function record(id: DeclarationId, name: string): RecordDeclaration {
  const typeParameters = [parameter(id, 0)];
  const field: FieldSymbol = { name: "value", type: parameterType(typeParameters[0]!), declarationSpan: span, index: 0 };
  return {
    id,
    typeParameters,
    name,
    nameSpan: span,
    exported: true,
    fields: [field],
    fieldsByName: new Map([[field.name, field]]),
  };
}

function enumeration(id: DeclarationId, name: string): EnumDeclaration {
  const typeParameters = [parameter(id, 0)];
  const payload: FieldSymbol = { name: "value", type: parameterType(typeParameters[0]!), declarationSpan: span, index: 0 };
  const variant = { name: "Has", declarationSpan: span, index: 0, payload: [payload] };
  return {
    id,
    typeParameters,
    name,
    nameSpan: span,
    exported: true,
    variants: [variant],
    variantsByName: new Map([[variant.name, variant]]),
  };
}

describe("declaration identity", () => {
  test("identity is structural, never reference equality", () => {
    const left: DeclarationId = { module: 1, local: 2 };
    const right: DeclarationId = { module: 1, local: 2 };
    assert.notEqual(left, right, "the test is meaningless if these are the same object");
    assert.equal(sameDeclarationId(left, right), true);
    assert.equal(declarationKey(left), declarationKey(right));
  });

  test("the module component distinguishes otherwise identical identities", () => {
    assert.equal(sameDeclarationId({ module: 1, local: 0 }, { module: 2, local: 0 }), false);
    assert.equal(sameDeclarationId({ module: 1, local: 0 }, { module: 1, local: 1 }), false);
    assert.notEqual(declarationKey({ module: 1, local: 0 }), declarationKey({ module: 2, local: 0 }));
    // The classic collision: a bare `local` would have made these equal.
    assert.notEqual(declarationKey({ module: 1, local: 1 }), declarationKey({ module: 2, local: 1 }));
  });

  test("keys are unambiguous, so no two distinct identities share one", () => {
    const seen = new Map<string, DeclarationId>();
    for (let module = 0; module < 12; module += 1) {
      for (let local = 0; local < 12; local += 1) {
        const id = { module, local };
        const key = declarationKey(id);
        assert.equal(seen.get(key), undefined, `key ${key} was already used`);
        seen.set(key, id);
      }
    }
    assert.equal(seen.size, 144);
  });

  test("records from different modules with the same local id are distinct types", () => {
    // This is the unsoundness Q05-A exists to remove: before it, both
    // declarations held the bare number 0 and compared equal.
    const user = recordType(record({ module: 1, local: 0 }, "User"), [{ kind: "Int" }]);
    const order = recordType(record({ module: 2, local: 0 }, "Order"), [{ kind: "Int" }]);
    assert.equal(sameType(user, order), false);
    assert.equal(isAssignable(user, order), false);
    assert.equal(isAssignable(order, user), false);
  });

  test("enums from different modules with the same local id are distinct types", () => {
    const left = enumType(enumeration({ module: 1, local: 3 }, "Wrap"), [{ kind: "Int" }]);
    const right = enumType(enumeration({ module: 2, local: 3 }, "Wrap"), [{ kind: "Int" }]);
    assert.equal(sameType(left, right), false);
    assert.equal(isAssignable(left, right), false);
  });

  test("a separately built identity still names the same declaration", () => {
    const declaration = record({ module: 1, local: 0 }, "User");
    const rebuilt = record({ module: 1, local: 0 }, "User");
    assert.notEqual(declaration, rebuilt);
    assert.equal(sameType(recordType(declaration, [{ kind: "Int" }]), recordType(rebuilt, [{ kind: "Int" }])), true);
  });

  test("identical declarations still differ by their type arguments", () => {
    const declaration = record({ module: 1, local: 0 }, "Box");
    assert.equal(sameType(recordType(declaration, [{ kind: "Int" }]), recordType(declaration, [{ kind: "String" }])), false);
    assert.equal(sameType(recordType(declaration, [{ kind: "Int" }]), recordType(declaration, [{ kind: "Int" }])), true);
  });
});

describe("generic owner identity", () => {
  test("owners differing only by module produce distinct type parameters", () => {
    const left = parameterType(parameter({ module: 1, local: 3 }, 0));
    const right = parameterType(parameter({ module: 2, local: 3 }, 0));
    assert.equal(typeName(left), "T");
    assert.equal(typeName(right), "T");
    assert.equal(sameType(left, right), false);
    assert.equal(isAssignable(left, right), false);
  });

  test("the same owner and index remain equal across separate constructions", () => {
    const owner: DeclarationId = { module: 1, local: 3 };
    const left = parameterType(parameter(owner, 0));
    const right = parameterType(parameter({ module: 1, local: 3 }, 0));
    assert.equal(sameType(left, right), true);
  });

  test("index still distinguishes parameters of one owner", () => {
    const owner: DeclarationId = { module: 1, local: 3 };
    assert.equal(sameType(parameterType(parameter(owner, 0, "T")), parameterType(parameter(owner, 1, "E"))), false);
  });

  test("substitution replaces only its own owner's parameters", () => {
    const mine: DeclarationId = { module: 1, local: 3 };
    const theirs: DeclarationId = { module: 2, local: 3 };
    const ours = parameterType(parameter(mine, 0));
    const foreign = parameterType(parameter(theirs, 0));

    assert.equal(typeName(substitute(ours, mine, [{ kind: "Int" }])), "Int");
    // Same local id, different module: substitution must leave it alone.
    assert.equal(typeName(substitute(foreign, mine, [{ kind: "Int" }])), "T");
    assert.equal(sameType(substitute(foreign, mine, [{ kind: "Int" }]), foreign), true);
  });

  test("substitution reaches nested applications and nullable layers", () => {
    const owner: DeclarationId = { module: 1, local: 0 };
    const box = record(owner, "Box");
    const nested: KType = { kind: "Nullable", inner: recordType(box, [parameterType(parameter(owner, 0))]) };
    assert.equal(typeName(substitute(nested, owner, [{ kind: "String" }])), "Box<String>?");
  });

  test("instantiatedField substitutes against the owning declaration", () => {
    const owner: DeclarationId = { module: 4, local: 7 };
    const box = record(owner, "Box");
    assert.equal(typeName(box.fields[0]!.type), "T");
    assert.equal(typeName(instantiatedField(box.fields[0]!, owner, [{ kind: "Float" }]).type), "Float");
    // An unrelated owner must not instantiate it.
    assert.equal(typeName(instantiatedField(box.fields[0]!, { module: 5, local: 7 }, [{ kind: "Float" }]).type), "T");
  });

  test("a function-owned parameter is representable and distinct from a type's", () => {
    // Slice 4A will create these; Q05-A only proves the representation admits
    // them and keeps them apart from a record's parameters.
    const typeOwner: DeclarationId = { module: ENTRY_MODULE_ID, local: 0 };
    const functionOwner: DeclarationId = { module: ENTRY_MODULE_ID, local: 1 };
    const fromType = parameterType(parameter(typeOwner, 0));
    const fromFunction = parameterType(parameter(functionOwner, 0));
    assert.equal(sameType(fromType, fromFunction), false);
    assert.equal(typeName(substitute(fromFunction, functionOwner, [{ kind: "Int" }])), "Int");
    assert.equal(typeName(substitute(fromFunction, typeOwner, [{ kind: "Int" }])), "T");
  });
});

describe("module numbering", () => {
  test("the prelude and the entry module are distinct reserved ids", () => {
    assert.equal(PRELUDE_MODULE_ID, 0);
    assert.equal(ENTRY_MODULE_ID, 1);
    assert.notEqual(PRELUDE_MODULE_ID, ENTRY_MODULE_ID);
  });

  test("user declarations never collide with the prelude", () => {
    const prelude = record({ module: PRELUDE_MODULE_ID, local: 0 }, "Result");
    const user = record({ module: ENTRY_MODULE_ID, local: 0 }, "Box");
    assert.equal(sameDeclarationId(prelude.id, user.id), false);
  });
});

describe("identity stays internal", () => {
  const path = "identity.ko";

  test("no emitted module exposes a declaration identity", () => {
    const source = [
      "type Box<T> { value: T }",
      "enum Wrap<T> { Has(value: T), None }",
      "export fn main() -> Unit {",
      "    b = Box<Int> { value: 1 }",
      "    w = Wrap<Int>.Has(b.value)",
      "}",
    ].join("\n");
    const result = build({ readFile: () => source }, { path, moduleFileName: "m.js" });
    assert.ok(result.ok, JSON.stringify(result.diagnostics));
    for (const artifact of result.artifacts) {
      assert.doesNotMatch(artifact.contents, /module["']?\s*:/);
      assert.doesNotMatch(artifact.contents, /\blocal\b/);
      assert.doesNotMatch(artifact.contents, /declarationId/);
    }
  });

  test("no diagnostic exposes a declaration identity", () => {
    const source = [
      "type Box<T> { value: T }",
      "type Other { n: Int }",
      "fn wrong() -> Box<String> { Box<Int> { value: 1 } }",
      "fn unconstrained() -> Unit { b = Box { value: 1 } }",
      "fn arity() -> Unit { b = Box<Int, String> { value: 1 } }",
      "fn nongeneric() -> Unit { o = Other<Int> { n: 1 } }",
    ].join("\n");
    const result = check({ readFile: () => source }, { path });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.length >= 4);

    const json = renderJson(result.diagnostics, result.files);
    assert.doesNotMatch(json, /declarationId|"module":\s*\d|"local":\s*\d/);
    for (const diagnostic of result.diagnostics) {
      const text = [diagnostic.message, diagnostic.primary.message ?? "", ...(diagnostic.notes ?? [])].join(" ");
      assert.doesNotMatch(text, /\bmodule \d|\blocal \d|declarationId/);
    }
  });
});
