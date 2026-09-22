/** Slice 3C: accepted evaluation order, bounded literal processing and layout. */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";
import { build, check, renderJson } from "../src/index.js";
import { INT_MIN, numeralAsFloat, numeralAsInt } from "../src/numeric/literals.js";

const prefix = `import { print } from "koda:io"
type Pair<A,B> { first: A, second: B }
enum Duo { Both(first: Int, second: Unit) }
fn first(a: Int, b: Unit) -> Int { a }
fn id(a: Int) -> Int { a }
fn unwrap(r: Result<Int,String>) -> Int { match r { Ok(v) => v, Err(_) => 0 } }
fn take(r: Result<Int,String>, ignored: Unit) -> Int { unwrap(r) }
`;

describe("Slice 3C operand evaluation", () => {
  const cases: [string, string, string][] = [
    ["mutable function argument", "first(x, if true { x = 2 } else {})", "1"],
    ["nested call argument", "first(id(x), if true { x = 2 } else {})", "1"],
    ["integer operands", "x + (if true { x = 2\n 10 } else { 0 })", "11"],
    ["float operands", "mut f = 1.0\n f + (if true { f = 2.0\n 10.0 } else { 0.0 })", "11.0"],
    ["string operands", 'mut s = "old"\n s + (if true { s = "new"\n "!" } else { "?" })', "old!"],
    ["equality operands", 'if x == (if true { x = 2\n 1 } else { 0 }) { 1 } else { 0 }', "1"],
    ["comparison operands", 'if x < (if true { x = 3\n 2 } else { 0 }) { 1 } else { 0 }', "1"],
    ["record fields", "p = Pair<Int,Unit> { first: x, second: if true { x = 2 } else {} }\n p.first", "1"],
    ["record source order differs from declaration", "p = Pair<Int,Unit> { second: if true { x = 2 } else {}, first: x }\n p.first", "2"],
    ["enum payload arguments", "d = Duo.Both(x, if true { x = 2 } else {})\n match d { Duo.Both(a, _) => a }", "1"],
    ["Result payload nested call", "r: Result<Int,String> = Ok(first(x, if true { x = 2 } else {}))\n unwrap(r)", "1"],
    ["Result argument survives later rebinding", "mut r: Result<Int,String> = Ok(1)\n value = take(r, if true { r = Ok(2) } else {})\n newer = unwrap(r)\n value", "1"],
    ["interpolation operands", '"{x}:{first(0, if true { x = 2 } else {})}"', "1:0"],
    ["short circuit skips mutation", "b = false && (if true { x = 2\n true } else { false })\n c = true || (if true { x = 3\n false } else { true })\n x", "1"],
    ["nullable match later operand", "n: Int? = null\n first(x, match n { null => { x = 2 }, v => {} })", "1"],
    ["early return in later argument", "first(x, if true { return 7 } else {})", "7"],
  ];
  for (const [name, body, expected] of cases) test(name, () => {
    const type = name === "float operands" ? "Float" : name === "string operands" || name === "interpolation operands" ? "String" : "Int";
    const source = prefix + `fn probe() -> ${type} { mut x = 1\n ${body} }\nexport fn main() -> Unit { print("{probe()}") }`;
    const compiled = build({ readFile: () => source }, { path: "repair.ko" });
    assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
    const runtime = new URL("../../../runtime/koda-runtime.mjs", import.meta.url).href;
    // Tests run from dist/test; runtime is a sibling package, no files written.
    const js = compiled.artifacts[0]!.contents.replace('"./koda-runtime.mjs"', JSON.stringify(runtime));
    const module = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
    const executed = spawnSync(process.execPath, ["--input-type=module", "--eval", `import { main } from ${JSON.stringify(module)}; main();`], { encoding: "utf8" });
    assert.equal(executed.status, 0, executed.stderr);
    assert.equal(executed.stdout, expected + "\n");
  });
});

describe("Slice 3C extreme numerals", () => {
  const huge = "9".repeat(310);
  for (const raw of ["1e" + huge, "1e-" + huge, "1e1000000000", "1e-1000000000", "9".repeat(10000), "9".repeat(10000) + ".0", "1_0e9_999_999_999", "9223372036854775808", "-9223372036854775809", "1__0", "1e+", "1.2.3"]) {
    test("diagnoses " + raw.slice(0, 28) + " (" + raw.length + " characters)", () => {
      const source = `fn probe() -> Int { ${raw} }`;
      const run = () => build({ readFile: () => source }, { path: "extreme.ko" });
      const actual = run();
      assert.equal(actual.ok, false);
      assert.deepEqual(actual.artifacts, []);
      assert.deepEqual(actual.diagnostics, run().diagnostics);
      const json = JSON.parse(renderJson(actual.diagnostics, actual.files));
      assert.ok(json.diagnostics.length > 0);
      const starts = actual.diagnostics.map(d => d.primary.span.start);
      assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    });
  }
  test("zero is exact regardless of exponent, except negative floating zero", () => {
    for (const raw of ["0e" + huge, "0e-" + huge]) {
      assert.deepEqual(numeralAsInt(raw, "float", false), { ok: true, value: 0n });
      assert.deepEqual(numeralAsInt(raw, "float", true), { ok: false, reason: { kind: "negative-zero-as-int" } });
    }
  });
  test("huge mantissa can cancel against a negative exponent exactly", () => {
    assert.deepEqual(numeralAsInt("1" + "0".repeat(10000) + "e-10000", "float", false), { ok: true, value: 1n });
    assert.deepEqual(numeralAsInt("0." + "0".repeat(10000) + "1e10001", "float", false), { ok: true, value: 1n });
    assert.deepEqual(numeralAsInt("1" + "0".repeat(10000) + "1e-10000", "float", false), { ok: false, reason: { kind: "not-integral" } });
  });
  test("Float overflow and underflow remain values, not Int errors", () => {
    assert.deepEqual(numeralAsFloat("1e" + huge, "float", false), { ok: true, value: Infinity });
    const tiny = numeralAsFloat("1e-" + huge, "float", true);
    assert.ok(tiny.ok && Object.is(tiny.value, -0));
    assert.deepEqual(numeralAsFloat("9".repeat(10000) + ".0", "float", false), { ok: true, value: Infinity });
  });
  test("Int boundaries remain exact across bases and decimal scaling", () => {
    for (const raw of ["9223372036854775808", "0x8000000000000000", "0o1000000000000000000000", "0b1" + "0".repeat(63)]) {
      assert.deepEqual(numeralAsInt(raw, "int", true), { ok: true, value: INT_MIN });
      assert.equal(numeralAsInt(raw, "int", false).ok, false);
    }
    assert.deepEqual(numeralAsInt("92233720368547758080e-1", "float", true), { ok: true, value: INT_MIN });
    assert.deepEqual(numeralAsInt("9223372036854775807.0", "float", false), { ok: true, value: 9223372036854775807n });
  });
});

describe("Slice 3C nested block layout", () => {
  const cases: [string, string][] = [
    ["if inside argument", "id(if true {\n x = 1\n x\n } else {\n 0\n })"],
    ["parenthesized block expression", "(if true {\n x = 1\n x\n } else { 0 })"],
    ["nested calls and blocks", "id(id(if true {\n x = id(if true {\n y = 2\n y\n } else { 0 })\n x\n } else { 0 }))"],
    ["match inside argument", "id(match Duo.Both(1, if true {} else {}) {\n Duo.Both(v, _) => {\n x = v\n x\n }\n })"],
    ["ordinary multiline arguments", "first(\n 1\n ,\n if true {} else {}\n )"],
    ["nested grouping inside restored block", "id(if true {\n x = (1 +\n 2)\n x\n } else { 0 })"],
    ["generic record braces inside call", "id(Pair<Int,Unit> {\n first: 1\n second: if true {} else {}\n }.first)"],
    ["record field block inside call", "id(Pair<Int,Unit> {\n first: if true {\n x = 1\n x\n } else { 0 }\n second: if true {} else {}\n }.first)"],
    ["outer argument layout restored after block", "first(\n if true {\n x = 1\n x\n } else { 0 }\n ,\n if true {} else {}\n )"],
    ["strings and comments do not alter delimiter context", 'id(if true {\n text = "(})\\{literal\\}"\n /* ( } */\n id(1)\n } else { 0 })'],
  ];
  for (const [name, expression] of cases) test(name, () => {
    const result = check({ readFile: () => prefix + `fn probe() -> Int { ${expression} }` }, { path: "layout.ko" });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  });
  test("mismatched delimiters recover without host exceptions", () => {
    for (const expression of ["id(if true {", "id(if true { ) }", "id((if true { 1 } else { 0 })", "id(Pair<Int,Unit> { first: (1 } })"]) {
      const result = check({ readFile: () => prefix + `fn probe() -> Int { ${expression} }` }, { path: "layout-error.ko" });
      assert.equal(result.ok, false);
    }
  });
});
