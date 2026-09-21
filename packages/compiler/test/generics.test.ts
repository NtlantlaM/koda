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
import { instantiatedField, isAssignable, sameType, substitute, typeName } from "../src/check/types.js";
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

  test("generic construction for user-defined data stays deferred", () => {
    // Result's prelude constructors are a narrow accepted surface; they are not
    // authority for arbitrary generic construction.
    const result = build(
      { readFile: () => "type Box<T> { value: T }\nfn use() -> Unit { b = Box<Int> { value: 42 } }" },
      { path },
    );
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "KODA-U0001"));
  });

  test("existing comparisons remain comparisons; explicit generic calls are rejected", () => {
    const comparison = check({ readFile: () => "fn less(a: Int, b: Int) -> Bool { a < b }" }, { path });
    assert.equal(comparison.ok, true);
    const call = check({ readFile: () => 'fn use() -> Unit { parse<Int>("42") }' }, { path });
    assert.deepEqual(call.diagnostics.map((diagnostic) => diagnostic.code), ["KODA-U0001"]);
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
    ]) {
      const result = build({ readFile: () => source }, { path });
      assert.equal(result.ok, false, source);
      assert.deepEqual(result.artifacts, []);
      assert.ok(result.diagnostics.length > 0);
    }
  });
});
