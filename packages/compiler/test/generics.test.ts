/** Slice 2A contracts exercised through source and the real compiler pipeline. */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { build, check, renderJson, SourceFile } from "../src/index.js";
import { DiagnosticBag } from "../src/diagnostics/diagnostic.js";
import { tokenize } from "../src/syntax/lexer.js";
import { parseModule } from "../src/syntax/parser.js";
import { checkModule } from "../src/check/checker.js";
import { instantiatedField, isAssignable, sameDeclarationId, sameType, substitute, typeName, type KType } from "../src/check/types.js";
import { repositoryRoot } from "./fixtures.js";

const root = repositoryRoot();
const path = "generics.ko";
function fixture(name: string): string {
  return readFileSync(join(root, "tests", "types", `${name}.ko`), "utf8");
}
function typed(source: string) {
  const file = new SourceFile(path, source);
  const diagnostics = new DiagnosticBag();
  const syntax = parseModule(file, tokenize(file, diagnostics), diagnostics);
  const ir = checkModule(path, syntax, diagnostics);
  assert.deepEqual(diagnostics.all, []);
  return ir;
}

describe("generic data-type foundations", () => {
  test("parameter identity belongs to the owner, not the spelling or allocation", () => {
    const source = "type First<T> { value: T }\ntype Second<T> { value: T }\nfn a(x: First<Int>) -> Unit {}\nfn b(x: Second<Int>) -> Unit {}";
    const ir = typed(source);
    const first = ir.functions[0]!.symbol.parameters[0]!.type;
    const second = ir.functions[1]!.symbol.parameters[0]!.type;
    assert.equal(first.kind, "Record");
    assert.equal(second.kind, "Record");
    if (first.kind !== "Record" || second.kind !== "Record") return;
    const a = first.declaration.fields[0]!.type;
    const b = second.declaration.fields[0]!.type;
    assert.equal(typeName(a), "T");
    assert.equal(typeName(b), "T");
    assert.equal(sameType(a, b), false);
    assert.equal(isAssignable(a, b), false);
    assert.equal(substitute(b, first.declaration.id, first.arguments), b);
    assert.equal(sameType(first, typed(source).functions[0]!.symbol.parameters[0]!.type), true);
  });

  test("substitution does not mutate a declaration shared by different applications", () => {
    const ir = typed("type Box<T> { value: T }\nfn a(x: Box<Int>) -> Int { x.value }\nfn b(x: Box<String>) -> String { x.value }");
    assert.equal(typeName(ir.functions[0]!.body.type), "Int");
    assert.equal(typeName(ir.functions[1]!.body.type), "String");
    const box = ir.functions[0]!.symbol.parameters[0]!.type;
    assert.equal(box.kind, "Record");
    if (box.kind !== "Record") return;
    assert.equal(typeName(box.declaration.fields[0]!.type), "T");
    assert.equal(typeName(instantiatedField(box.declaration.fields[0]!, box.declaration.id, box.arguments).type), "Int");
  });

  test("nullable substitution flattens fields without collapsing application identity", () => {
    const ir = typed("type Maybe<T> { value: T? }\nfn a(x: Maybe<Int>) -> Int? { x.value }\nfn b(x: Maybe<Int?>) -> Int? { x.value }");
    assert.equal(typeName(ir.functions[0]!.body.type), "Int?");
    assert.equal(typeName(ir.functions[1]!.body.type), "Int?");
    const a = ir.functions[0]!.symbol.parameters[0]!.type;
    const b = ir.functions[1]!.symbol.parameters[0]!.type;
    assert.equal(isAssignable(a, b), false);
    assert.equal(isAssignable(b, a), false);
  });

  test("the full positive fixture builds deterministically without construction", () => {
    const source = fixture("generic-foundations");
    const host = { readFile: () => source };
    const first = build(host, { path });
    const second = build(host, { path });
    assert.ok(first.ok, JSON.stringify(first.diagnostics));
    assert.deepEqual(first.artifacts, second.artifacts);
    assert.ok(first.artifacts.length > 0);
    assert.ok(first.hasEntry);
  });

  test("invalid generic programs never emit artifacts and diagnostics are deterministic", () => {
    for (const name of ["generic-arity", "generic-identity", "generic-parameters", "generic-recursion", "generic-construction"]) {
      const source = fixture(name);
      const host = { readFile: () => source };
      const first = build(host, { path });
      const second = build(host, { path });
      assert.equal(first.ok, false, name);
      assert.deepEqual(first.artifacts, [], name);
      assert.deepEqual(first.diagnostics, second.diagnostics, name);
      assert.ok(first.diagnostics.every((diagnostic) => diagnostic.code !== "KODA-I0001"));
    }
  });

  test("JSON diagnostics carry the application and declaration spans", () => {
    const source = "type Box<T> { value: T }\nfn use(x: Box<Int, String>) -> Unit {}";
    const result = check({ readFile: () => source }, { path });
    const json = JSON.parse(renderJson(result.diagnostics, result.files));
    assert.equal(typeof json.schemaVersion, "string");
    assert.equal(json.diagnostics.length, 1);
    const diagnostic = json.diagnostics[0];
    assert.equal(diagnostic.code, "KODA-T0011");
    assert.equal(diagnostic.primary.span.startLine, 2);
    assert.equal(diagnostic.secondary[0].span.startLine, 1);
    assert.equal(Buffer.from(source).subarray(diagnostic.primary.span.start, diagnostic.primary.span.end).toString(), "Box<Int, String>");
  });

  test("Result is an ordinary generic enum application", () => {
    // Slice 2B turned Result on; a type position now resolves it like any
    // other generic enum, arity included.
    // The parameter is forwarded, because an ignored Result parameter is now
    // a must-handle error (ADR 0010).
    const applied = check(
      { readFile: () => "fn use(x: Result<Int, String>) -> Result<Int, String> { x }" },
      { path },
    );
    assert.equal(applied.ok, true);

    const arity = check({ readFile: () => "fn use(x: Result<Int>) -> Unit {}" }, { path });
    assert.deepEqual(
      arity.diagnostics.map((diagnostic) => diagnostic.code),
      ["KODA-T0011"],
    );
  });

  test("a Result constructor still needs a context that names both sides", () => {
    for (const source of [
      "fn use() -> Unit { value = Ok(1) }",
      'fn use() -> Unit { value = Err("failure") }',
    ]) {
      const result = build({ readFile: () => source }, { path });
      assert.equal(result.ok, false);
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "KODA-T0001"));
      assert.deepEqual(result.artifacts, []);
    }
  });

  test("construction applies the written arguments and keeps applications distinct", () => {
    const ir = typed(
      'type Box<T> { value: T }\nfn a() -> Box<Int> { Box<Int> { value: 1 } }\nfn b() -> Box<String> { Box { value: "x" } }',
    );
    const first = ir.functions[0]!.body.type;
    const second = ir.functions[1]!.body.type;
    assert.equal(typeName(first), "Box<Int>");
    assert.equal(typeName(second), "Box<String>");
    assert.equal(sameType(first, second), false);
    assert.equal(isAssignable(first, second), false);
  });

  test("construction does not mutate the declaration it instantiates", () => {
    const ir = typed("type Box<T> { value: T }\nfn a() -> Box<Int> { Box<Int> { value: 1 } }");
    const box = ir.functions[0]!.body.type;
    assert.equal(box.kind, "Record");
    if (box.kind !== "Record") return;
    assert.equal(typeName(box.declaration.fields[0]!.type), "T");
    assert.equal(typeName(instantiatedField(box.declaration.fields[0]!, box.declaration.id, box.arguments).type), "Int");
  });

  test("a generic value still needs a complete expected type or written arguments", () => {
    for (const source of [
      "type Box<T> { value: T }\nfn use() -> Unit { b = Box { value: 42 } }",
      "enum Wrap<T> { Has(value: T) }\nfn use() -> Unit { w = Wrap.Has(42) }",
      "type Box<T> { value: T }\ntype Pair<A, B> { left: A, right: B }\nfn use() -> Pair<Int, Int> { Box { value: 1 } }",
    ]) {
      const result = build({ readFile: () => source }, { path });
      assert.equal(result.ok, false, source);
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "KODA-T0001"), source);
      // The value's own contents must never be what supplies the argument.
      assert.ok(result.diagnostics.every((diagnostic) => !diagnostic.message.includes("inferred")), source);
      assert.deepEqual(result.artifacts, []);
    }
  });

  test("written type arguments are authoritative, never adjusted to the context", () => {
    const result = check(
      { readFile: () => "type Box<T> { value: T }\nfn use() -> Box<String> { Box<Int> { value: 42 } }" },
      { path },
    );
    assert.equal(result.ok, false);
    const mismatch = result.diagnostics.find((diagnostic) => diagnostic.code === "KODA-T0001");
    assert.ok(mismatch);
    assert.match(mismatch.message, /expected Box<String>, found Box<Int>/);
  });

  test("an angle bracket after a name is an application only before '{', '.' or '('", () => {
    // `a < b > c` stays two comparisons, so it fails as a non-associative
    // chain. What matters is that it is never read as a type application.
    const chained = check(
      { readFile: () => "fn use(a: Int, b: Int, c: Int) -> Bool { a < b > c }" },
      { path },
    );
    assert.equal(chained.ok, false);
    assert.equal(chained.diagnostics[0]?.code, "KODA-P0001");
    assert.match(chained.diagnostics[0]!.message, /cannot be chained/);
    assert.ok(chained.diagnostics.every((diagnostic) => diagnostic.code !== "KODA-U0001"));

    const comparison = check({ readFile: () => "fn less(a: Int, b: Int) -> Bool { a < b }" }, { path });
    assert.equal(comparison.ok, true);

    const head = check(
      { readFile: () => "fn use(a: Int, b: Int) -> Int { if a < b { 1 } else { 2 } }" },
      { path },
    );
    assert.equal(head.ok, true);
  });

  test("construction is fully erased: no type argument reaches the emitted module", () => {
    const emitted = build(
      { readFile: () => "type Box<T> { value: T }\nexport fn main() -> Unit { b = Box<Int> { value: 1 } }" },
      { path, moduleFileName: "m.js" },
    );
    assert.ok(emitted.ok, JSON.stringify(emitted.diagnostics));
    const module = emitted.artifacts.find((artifact) => artifact.fileName === "m.js")!;
    assert.match(module.contents, /k_value: 1n/);
    assert.doesNotMatch(module.contents, /Box|Int/);
  });

  test("existing comparisons remain comparisons now that generic calls parse", () => {
    const comparison = check({ readFile: () => "fn less(a: Int, b: Int) -> Bool { a < b }" }, { path });
    assert.equal(comparison.ok, true);

    // A generic call is the `(` branch of the same lookahead; an unknown callee
    // is an unresolved name, never a comparison and never a parse failure.
    const unknown = check({ readFile: () => 'fn use() -> Unit { parse<Int>("42") }' }, { path });
    assert.deepEqual(unknown.diagnostics.map((diagnostic) => diagnostic.code), ["KODA-N0001"]);

    const chained = check(
      { readFile: () => "fn use(a: Int, b: Int, c: Int) -> Bool { a < b > c }" },
      { path },
    );
    assert.equal(chained.diagnostics[0]?.code, "KODA-P0001");
  });

  test("substitution does not silently implement the deferred nullable Unit runtime", () => {
    for (const source of [
      "type Maybe<T> { value: T? }\nfn use(x: Maybe<Unit>) -> Unit { value = x.value }",
      "enum Maybe<T> { Value(value: T?) }\nfn use(x: Maybe<Unit>) -> Unit { match x { Maybe.Value(value) => {} } }",
    ]) {
      const result = build({ readFile: () => source }, { path });
      assert.equal(result.ok, false);
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "KODA-U0001" && diagnostic.message.includes("Unit?")));
      assert.deepEqual(result.artifacts, []);
    }
  });

  test("malformed generic syntax recovers without crashing", () => {
    for (const source of [
      "type Box<", "type Box<T", "type Box<,>", "type Box<T,,U> {}",
      "enum Box<T:> {}", "type Box<T> { value: Box<Box< }",
      "type Box<T> { value: T }\nfn use(x: Box<) -> Unit {}",
      "type Box<T> { value: T }\nfn use(x: Box<Int String>) -> Unit {}",
      "fn f<", "fn f<T", "fn f<,>(x: Int) -> Int { x }",
      "fn f<T>(x: T) -> T { x }\nfn g() -> Int { f<(1) }",
      "fn f<T>(x: T) -> T { x }\nfn g() -> Int { f<Int>( }",
    ]) {
      const result = build({ readFile: () => source }, { path });
      assert.equal(result.ok, false, source);
      assert.deepEqual(result.artifacts, []);
      assert.ok(result.diagnostics.length > 0);
    }
  });
});

describe("generic functions", () => {
  test("a call's type is the substituted return type", () => {
    const ir = typed(
      "type Box<T> { value: T }\n" +
        "fn identity<T>(x: T) -> T { x }\n" +
        "fn box<T>(x: T) -> Box<T> { Box<T> { value: x } }\n" +
        "fn a() -> Int { identity<Int>(1) }\n" +
        "fn b() -> Box<String> { box<String>(\"k\") }",
    );
    assert.equal(typeName(ir.functions[2]!.body.type), "Int");
    assert.equal(typeName(ir.functions[3]!.body.type), "Box<String>");
  });

  test("a callee's type parameter cannot capture a caller's", () => {
    // Q05-A gave functions distinct declaration ids precisely for this.
    const ir = typed(
      "fn identity<T>(x: T) -> T { x }\nfn forward<U>(x: U) -> U { identity<U>(x) }",
    );
    const identity = ir.functions[0]!.symbol;
    const forward = ir.functions[1]!.symbol;
    assert.equal(sameDeclarationId(identity.declarationId, forward.declarationId), false);

    const t = identity.typeParameters[0]!;
    const u = forward.typeParameters[0]!;
    assert.equal(t.index, u.index);
    assert.equal(t.name, "T");
    assert.equal(u.name, "U");
    assert.equal(sameDeclarationId(t.ownerId, u.ownerId), false);
    assert.equal(sameType({ kind: "TypeParameter", parameter: t }, { kind: "TypeParameter", parameter: u }), false);

    // Substituting identity's owner must leave forward's parameter untouched.
    const asU: KType = { kind: "TypeParameter", parameter: u };
    assert.equal(typeName(substitute(asU, identity.declarationId, [{ kind: "Int" }])), "U");
    assert.equal(typeName(substitute(asU, forward.declarationId, [{ kind: "Int" }])), "Int");

    // The forwarding call still types as the caller's own parameter.
    assert.equal(typeName(ir.functions[1]!.body.type), "U");
  });

  test("type arguments are never inferred", () => {
    const missing = check(
      { readFile: () => "fn identity<T>(x: T) -> T { x }\nfn use() -> Int { identity(1) }" },
      { path },
    );
    assert.equal(missing.ok, false);
    const diagnostic = missing.diagnostics.find((item) => item.code === "KODA-T0011");
    assert.ok(diagnostic);
    assert.ok(diagnostic.notes?.some((note) => note.includes("does not infer")));
    // No message may offer inference as the remedy.
    assert.ok(missing.diagnostics.every((item) => !/\binferred\b|\bwill infer\b/.test(item.message)));
  });

  test("a generic call emits the same shape as an ordinary call", () => {
    const emitted = build(
      {
        readFile: () =>
          "fn identity<T>(x: T) -> T { x }\n" +
          "fn plain(x: Int) -> Int { x }\n" +
          "export fn main() -> Unit { a = identity<Int>(1)\n    b = plain(1) }",
      },
      { path, moduleFileName: "m.js" },
    );
    assert.ok(emitted.ok, JSON.stringify(emitted.diagnostics));
    const module = emitted.artifacts.find((artifact) => artifact.fileName === "m.js")!;
    assert.match(module.contents, /const k_a = k_identity\(1n\);/);
    assert.match(module.contents, /const k_b = k_plain\(1n\);/);
    // No type argument, descriptor or specialization may reach the output.
    assert.doesNotMatch(module.contents, /Int|typeArgument|<|identity\$/);
  });

  test("an abstract type parameter must be handed on, and is never told to match", () => {
    const result = check({ readFile: () => "fn ignore<T>(x: T) -> Unit { }" }, { path });
    assert.equal(result.ok, false);
    const diagnostic = result.diagnostics.find((item) => item.code === "KODA-T0012");
    assert.ok(diagnostic, "an abandoned abstract responsibility must be reported");
    const notes = (diagnostic.notes ?? []).join(" ");
    assert.match(notes, /unconstrained generic type/);
    assert.doesNotMatch(notes, /match the Result/);

    // Handing it on is accepted.
    assert.equal(check({ readFile: () => "fn identity<T>(x: T) -> T { x }" }, { path }).ok, true);
  });
});
