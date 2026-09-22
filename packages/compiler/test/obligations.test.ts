import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { build, check, renderJson } from "../src/index.js";

const common = `enum E { Bad }
type Holder { outcome: Result<Int,E> }
type Pair { first: Result<Int,E>, second: Result<Int,E> }
type Box<T> { value: T }
type Phantom<T> { marker: Int }
enum Work { None, Pending(outcome: Result<Int,E>) }
enum Wrap<T> { None, Has(value: T) }
enum Both { Values(first: Result<Int,E>, second: Result<Int,E>), None }
fn make() -> Result<Int,E> { Ok(1) }
fn handle(r: Result<Int,E>) -> Unit { match r { Ok(_) => {}, Err(_) => {} } }
fn consumes(r: Result<Int,E>) -> Bool { handle(r)
 true }
fn pair() -> Pair { Pair { first: make(), second: make() } }
fn holder() -> Holder { Holder { outcome: make() } }
fn maybe() -> Result<Int,E>? { null }
fn other() -> Unit {}
`;
function result(source: string) { return check({ readFile: () => common + source }, { path: "obligations.ko" }); }
function expectCase(source: string, codes: string[]) {
  const actual = result(source);
  assert.deepEqual(actual.diagnostics.map(d => d.code), codes, JSON.stringify(actual.diagnostics));
  assert.equal(actual.ok, codes.length === 0);
}

describe("Stage A execution paths", () => {
  for (const op of ["&&", "||"]) {
    test(op + " RHS does not discharge skipped path", () => expectCase(`fn probe(flag: Bool) -> Unit { r = make()
 answer = flag ${op} consumes(r) }`, ["KODA-T0012"]));
    test(op + " enclosing condition preserves execution paths", () => expectCase(`fn probe(flag: Bool) -> Unit { r = make()
 if flag ${op} consumes(r) { handle(r) } else { handle(r) } }`, []));
    test(op + " executed literal path", () => expectCase(`fn probe() -> Unit { r = make()
 answer = ${op === "&&" ? "true" : "false"} ${op} consumes(r) }`, []));
    test(op + " skipped literal path", () => expectCase(`fn probe() -> Unit { r = make()
 answer = ${op === "&&" ? "false" : "true"} ${op} consumes(r) }`, ["KODA-T0012"]));
  }
  test("nested operators retain skipped paths", () => expectCase("fn probe(a: Bool, b: Bool) -> Unit { r = make()\n x = a && (b || consumes(r)) }", ["KODA-T0012"]));
  test("true branch of conjunction has executed RHS", () => expectCase("fn probe(flag: Bool) -> Unit { r = make()\n if flag && consumes(r) {} else { handle(r) } }", []));
  test("false branch of disjunction has executed RHS", () => expectCase("fn probe(flag: Bool) -> Unit { r = make()\n if flag || consumes(r) { handle(r) } else {} }", []));
  test("diagnostics repeat deterministically", () => { const s = "fn probe(flag: Bool) -> Unit { r = make()\n x = flag && consumes(r) }"; assert.deepEqual(result(s).diagnostics, result(s).diagnostics); });
});

const structural: [string, string, string[]][] = [
  ["one field abandoned", "fn probe() -> Unit { h = holder() }", ["KODA-T0012"]],
  ["one field handled", "fn probe() -> Unit { h = holder()\n handle(h.outcome) }", []],
  ["partial handling", "fn probe() -> Unit { p = pair()\n handle(p.first) }", ["KODA-T0012"]],
  ["extraction retains sibling", "fn probe() -> Unit { p = pair()\n r = p.first\n handle(r) }", ["KODA-T0012"]],
  ["source read does not handle destination", "fn probe() -> Unit { h = holder()\n r = h.outcome\n handle(h.outcome) }", ["KODA-T0012"]],
  ["source remains readable", "fn probe() -> Unit { h = holder()\n r = h.outcome\n handle(r)\n handle(h.outcome) }", []],
  ["repeated storage has two receivers", "fn probe() -> Unit { r = make()\n p = Pair { first: r, second: r } }", ["KODA-T0012", "KODA-T0012"]],
  ["copy renews handled field", "fn probe() -> Unit { p = pair()\n handle(p.first)\n q = p\n handle(q.second) }", ["KODA-T0012"]],
  ["whole copy transfers source", "fn probe() -> Unit { p = pair()\n q = p\n handle(q.first)\n handle(q.second) }", []],
  ["handled source receiver renews", "fn probe() -> Unit { h = holder()\n handle(h.outcome)\n r = h.outcome }", ["KODA-T0012"]],
  ["ignored aggregate parameter", "fn probe(h: Holder) -> Unit {}", ["KODA-T0012"]],
  ["partial parameter return", "fn probe(p: Pair) -> Result<Int,E> { handle(p.first)\n p.second }", []],
  ["partial parameter leaves sibling", "fn probe(p: Pair) -> Result<Int,E> { p.first }", ["KODA-T0012"]],
  ["parameter forward", "fn probe(h: Holder) -> Holder { h }", []],
  ["handled aggregate return renews at call", "fn forward(h: Holder) -> Holder { handle(h.outcome)\n h }\nfn probe() -> Unit { h = forward(holder()) }", ["KODA-T0012"]],
  ["temporary sibling", "fn probe() -> Unit { handle(pair().first) }", ["KODA-T0005"]],
  ["temporary sibling on return", "fn probe() -> Result<Int,E> { pair().first }", ["KODA-T0005"]],
  ["discarded aggregate call", "fn probe() -> Unit { holder()\n other() }", ["KODA-T0005"]],
  ["nullable call discard", "fn probe() -> Unit { maybe()\n other() }", ["KODA-T0005"]],
  ["overwrite outstanding sibling", "fn probe() -> Unit { mut p = pair()\n handle(p.first)\n p = pair()\n handle(p.first)\n handle(p.second) }", ["KODA-T0013"]],
  ["overwrite after handling", "fn probe() -> Unit { mut h = holder()\n handle(h.outcome)\n h = holder()\n handle(h.outcome) }", []],
  ["forwarding RHS", "fn forward(h: Holder) -> Holder { h }\nfn probe() -> Unit { mut h = holder()\n h = forward(h)\n handle(h.outcome) }", []],
  ["generation separation", "fn probe() -> Unit { mut h = holder()\n old = h\n h = holder()\n handle(old.outcome) }", ["KODA-T0012"]],
  ["generic nested fields", "fn probe() -> Unit { b = Box<Box<Holder>> { value: Box { value: holder() } }\n handle(b.value.value.outcome) }", []],
  ["phantom has no responsibility", "fn probe() -> Unit { p = Phantom<Result<Int,E>> { marker: 1 } }", []],
  ["both branches handle", "fn probe(flag: Bool) -> Unit { h = holder()\n if flag { handle(h.outcome) } else { handle(h.outcome) } }", []],
  ["one branch leaves field", "fn probe(flag: Bool) -> Unit { h = holder()\n if flag { handle(h.outcome) } }", ["KODA-T0012"]],
  ["different branches handle different fields", "fn probe(flag: Bool) -> Unit { p = pair()\n if flag { handle(p.first) } else { handle(p.second) } }", ["KODA-T0012", "KODA-T0012"]],
  ["early return outstanding", "fn probe(flag: Bool) -> Unit { h = holder()\n if flag { return }\n handle(h.outcome) }", ["KODA-T0012"]],
  ["branch value transfer", "fn probe(flag: Bool) -> Holder { if flag { h = holder()\n h } else { holder() } }", []],
];
describe("Stage B structural engine", () => { for (const [name, source, codes] of structural) test(name, () => expectCase(source, codes)); });

const conditional: [string, string, string[]][] = [
  ["known empty variant", "fn probe() -> Unit { w = Work.None }", []],
  ["known payload variant", "fn probe() -> Unit { w = Work.Pending(make()) }", ["KODA-T0012"]],
  ["unknown variant parameter", "fn probe(w: Work) -> Unit {}", ["KODA-T0012"]],
  ["variant pattern transfer", "fn probe(w: Work) -> Unit { match w { Work.None => {}, Work.Pending(r) => { handle(r) } } }", []],
  ["payload wildcard retains duty", "fn probe(w: Work) -> Unit { match w { Work.None => {}, Work.Pending(_) => {} } }", ["KODA-T0012"]],
  ["whole catchall retains duty", "fn probe(w: Work) -> Unit { match w { _ => {} } }", ["KODA-T0012"]],
  ["wildcard then later handling", "fn probe(w: Work) -> Unit { match w { _ => {} }\n match w { Work.None => {}, Work.Pending(r) => { handle(r) } } }", []],
  ["impossible payload has no duty", "fn probe() -> Unit { w = Work.None\n match w { Work.None => {}, Work.Pending(r) => {} } }", []],
  ["two payloads", "fn probe(w: Both) -> Unit { match w { Both.None => {}, Both.Values(a, b) => { handle(a) } } }", ["KODA-T0012"]],
  ["generic nested payload", "fn probe(w: Wrap<Box<Result<Int,E>>>) -> Unit { match w { Wrap.None => {}, Wrap.Has(b) => { handle(b.value) } } }", []],
  ["nested payload abandoned", "fn probe(w: Wrap<Box<Result<Int,E>>>) -> Unit { match w { Wrap.None => {}, Wrap.Has(b) => {} } }", ["KODA-T0012"]],
  ["nullable holder handled", "fn probe(h: Holder?) -> Unit { match h { null => {}, p => { handle(p.outcome) } } }", []],
  ["nullable holder wildcard", "fn probe(h: Holder?) -> Unit { match h { null => {}, _ => {} } }", ["KODA-T0012"]],
  ["nullable field stages", "fn probe(b: Box<Result<Int,E>?>) -> Unit { match b.value { null => {}, r => { handle(r) } } }", []],
  ["nullable result wildcard", "fn probe(r: Result<Int,E>?) -> Unit { match r { null => {}, _ => {} } }", ["KODA-T0012"]],
  ["known null preserves stage", "fn probe() -> Unit { r: Result<Int,E>? = null }", ["KODA-T0012"]],
  ["known null match", "fn probe() -> Unit { r: Result<Int,E>? = null\n match r { null => {}, p => {} } }", []],
  ["nested Ok wildcard", "fn probe(r: Result<Result<Int,E>,E>) -> Unit { match r { Ok(_) => {}, Err(_) => {} } }", ["KODA-T0012"]],
  ["nested Err wildcard", "fn probe(r: Result<Int,Result<Int,E>>) -> Unit { match r { Ok(_) => {}, Err(_) => {} } }", ["KODA-T0012"]],
  ["nested Ok handled", "fn probe(r: Result<Result<Int,E>,E>) -> Unit { match r { Ok(inner) => { handle(inner) }, Err(_) => {} } }", []],
  ["nested Err handled", "fn probe(r: Result<Int,Result<Int,E>>) -> Unit { match r { Ok(_) => {}, Err(inner) => { handle(inner) } } }", []],
  ["temporary payload wildcard", "fn probe() -> Unit { match Work.Pending(make()) { Work.Pending(_) => {}, Work.None => {} } }", ["KODA-T0005"]],
  ["conditional variant absence", "fn probe(flag: Bool) -> Unit { w = if flag { Work.None } else { Work.Pending(make()) }\n match w { Work.None => {}, Work.Pending(r) => { handle(r) } } }", []],
];
describe("Stage C conditional payloads", () => { for (const [name, source, codes] of conditional) test(name, () => expectCase(source, codes)); });

describe("structural diagnostic contracts", () => {
  test("path, origin, JSON and repeatability", () => { const r = result("fn probe() -> Unit { p = pair()\n handle(p.first) }"); assert.equal(r.diagnostics.length, 1); assert.match(r.diagnostics[0]!.message, /p.second/); assert.ok(r.diagnostics[0]!.secondary.length); const json = JSON.parse(renderJson(r.diagnostics, r.files)); assert.equal(json.diagnostics[0].code, "KODA-T0012"); assert.deepEqual(r.diagnostics, result("fn probe() -> Unit { p = pair()\n handle(p.first) }").diagnostics); });
  test("failed structural build emits nothing", () => { const r = build({readFile: () => common + "fn probe() -> Unit { h = holder() }"}, {path: "bad.ko"}); assert.equal(r.ok, false); assert.deepEqual(r.artifacts, []); });
});

// Cross-stage edge cases pin transport and residual accounting, not just shapes.
describe("structural edge cases", () => {
  const cases: [string, string, string[]][] = [
    ["discarded aggregate tail uses T0005", "fn probe() -> Unit { holder() }", ["KODA-T0005"]],
    ["discarded nullable tail uses T0005", "fn probe() -> Unit { maybe() }", ["KODA-T0005"]],
    ["temporary construction projection", "fn probe() -> Unit { handle(Pair { first: make(), second: make() }.first) }", ["KODA-T0005"]],
    ["nested temporary projection", "fn probe() -> Unit { handle(Box<Pair> { value: pair() }.value.first) }", ["KODA-T0005"]],
    ["aggregate argument fully forwarded", "fn sink(p: Pair) -> Unit { handle(p.first)\n handle(p.second) }\nfn probe() -> Unit { sink(pair()) }", []],
    ["nullable aggregate direct match", "fn absent() -> Holder? { null }\nfn probe(flag: Bool) -> Unit { match (if flag { holder() } else { absent() }) { null => {}, h => { handle(h.outcome) } } }", []],
    ["nullable generic outer stage", "fn probe(b: Box<Result<Int,E>>?) -> Unit { match b { null => {}, v => { handle(v.value) } } }", []],
    ["known empty copy", "fn probe() -> Unit { w = Work.None\n copy = w }", []],
    ["returned known empty loses private facts", "fn none() -> Work { Work.None }\nfn probe() -> Unit { w = none() }", ["KODA-T0012"]],
    ["nested Result wildcard later handled", "fn probe(r: Result<Result<Int,E>,E>) -> Unit { match r { Ok(_) => {}, Err(_) => {} }\n match r { Ok(inner) => { handle(inner) }, Err(_) => {} } }", []],
    ["temporary nullable wildcard", "fn probe() -> Unit { match maybe() { null => {}, _ => {} } }", ["KODA-T0005"]],
    ["nullable binding without null arm renews stage", "fn probe(r: Result<Int,E>?) -> Unit { match r { same => {} } }", ["KODA-T0012"]],
    ["temporary nested result wildcard", "fn nested() -> Result<Result<Int,E>,E> { Ok(make()) }\nfn probe() -> Unit { match nested() { Ok(_) => {}, Err(_) => {} } }", ["KODA-T0005"]],
    ["nested Result Err construction", "fn probe() -> Unit { r: Result<Int,Result<Int,E>> = Err(make())\n match r { Ok(_) => {}, Err(inner) => { handle(inner) } } }", []],
    ["interrupted call preserves earlier argument", "fn sink(r: Result<Int,E>, n: Int) -> Unit { handle(r) }\nfn probe() -> Unit { sink(make(), if true { return } else { 1 }) }", ["KODA-T0005"]],
    ["interrupted construction has no phantom later fields", "fn probe() -> Unit { p = Pair { first: make(), second: if true { return } else { make() } } }", ["KODA-T0005"]],
    ["conditional field absence", "fn probe(w: Work) -> Unit { match w { Work.None => { return }, Work.Pending(r) => { handle(r) } } }", []],
  ];
  for (const [name, source, codes] of cases) test(name, () => expectCase(source, codes));
  test("one responsibility is not repeated across nested exits", () => { const r = result("fn probe(a: Bool, b: Bool) -> Unit { h = holder()\n if a { if b { return }\n return } }"); assert.equal(r.diagnostics.length, 1); });
});

// Identical continuations must not multiply at every independent statement.
test("coalesces identical branch continuations", () => {
  expectCase("fn probe(flag: Bool) -> Unit { h = holder()\n" + "if flag {}\n".repeat(24) + "handle(h.outcome) }", []);
});

// Slice 5: a list carries one collective responsibility for all its elements.
describe("list responsibility", () => {
  const lists = `fn all() -> List<Result<Int,E>> { [make(), make()] }
fn nothing() -> Unit {}
`;
  function listCase(source: string, codes: string[]) {
    const actual = check({ readFile: () => common + lists + source }, { path: "obligations.ko" });
    assert.deepEqual(actual.diagnostics.map(d => d.code), codes, JSON.stringify(actual.diagnostics));
    assert.equal(actual.ok, codes.length === 0);
  }

  test("R1 normal completion discharges every element", () => {
    listCase("fn probe() -> Unit { for r in all() { handle(r) } }", []);
  });

  test("an ignored loop binding is reported", () => {
    listCase("fn probe() -> Unit { for r in all() { nothing() } }", ["KODA-T0012"]);
  });

  test("a list that is never iterated is reported", () => {
    listCase("fn probe() -> Unit { rs = all() }", ["KODA-T0012"]);
  });

  // R2 is the critical soundness invariant: reading ONE element must never
  // discharge the whole collection, or N-1 outcomes vanish silently.
  test("R2 get renews the value read and leaves the list responsible", () => {
    const actual = check(
      { readFile: () => common + lists + "fn probe() -> Unit { rs = all()\n first = rs.get(0) }" },
      { path: "obligations.ko" },
    );
    assert.equal(actual.ok, false);
    assert.deepEqual(actual.diagnostics.map(d => d.code), ["KODA-T0012", "KODA-T0012"]);
    const labels = actual.diagnostics.map(d => d.message).join(" | ");
    assert.match(labels, /'rs\[\]'/, "the collection itself must still be reported");
    assert.match(labels, /'first'/, "the value read must carry its own responsibility");
  });

  test("R2 length and isEmpty inspect no element and discharge nothing", () => {
    listCase("fn probe() -> Int { rs = all()\n rs.length() }", ["KODA-T0012"]);
    listCase("fn probe() -> Bool { rs = all()\n rs.isEmpty() }", ["KODA-T0012"]);
  });

  // R3: leaving the loop early proves nothing about the unvisited elements.
  test("R3 an early return does not discharge the rest of the list", () => {
    const actual = check(
      {
        readFile: () =>
          common + lists +
          "fn probe() -> Int { for r in all() { match r { Ok(v) => { return v }, Err(_) => {} } }\n 0 }",
      },
      { path: "obligations.ko" },
    );
    assert.equal(actual.ok, false, "an early return must not silently lose the unvisited elements");
    assert.ok(actual.diagnostics.some(d => d.code === "KODA-T0005" || d.code === "KODA-T0012"));
  });

  test("repeated iteration renews, so each loop must account for what it reads", () => {
    listCase("fn probe() -> Unit { rs = all()\n for r in rs { handle(r) }\n for r in rs { handle(r) } }", []);
    listCase("fn probe() -> Unit { rs = all()\n for r in rs { handle(r) }\n for r in rs { nothing() } }", ["KODA-T0012"]);
  });

  test("responsibility flows only through stored members", () => {
    // A list of a container reports the structural path through its element.
    const nested = check(
      { readFile: () => common + lists + "fn probe() -> Unit { bs: List<Box<Result<Int,E>>> = [Box<Result<Int,E>> { value: make() }] }" },
      { path: "obligations.ko" },
    );
    assert.equal(nested.ok, false);
    assert.match(nested.diagnostics[0]!.message, /bs\[\]\.value/);

    // A non-bearing list is entirely silent, including through an intrinsic.
    listCase('fn probe() -> Int { names = ["a", "b"]\n names.length() }', []);
  });

  test("a list handed onward is discharged", () => {
    listCase("fn probe() -> List<Result<Int,E>> { all() }", []);
  });
});

// Slice 5: a list lowers to a plain array and iterates with for...of.
describe("list lowering", () => {
  test("a list is an unfrozen array and a loop is for...of", () => {
    const emitted = build(
      {
        readFile: () =>
          'export fn main() -> Unit { xs = [1, 2]\n for x in xs { other(x) } }\nfn other(n: Int) -> Unit {}',
      },
      { path: "lists.ko", moduleFileName: "m.js" },
    );
    assert.ok(emitted.ok, JSON.stringify(emitted.diagnostics));
    const module = emitted.artifacts.find(a => a.fileName === "m.js")!;
    assert.match(module.contents, /\[1n, 2n\]/);
    assert.match(module.contents, /for \(const k_x of k_xs\) \{/);
    // Semantic immutability comes from the language, not from freezing.
    assert.doesNotMatch(module.contents, /freeze/);
    // No type argument may reach the output.
    assert.doesNotMatch(module.contents, /List|Int\b/);
  });
});
