/**
 * Negative and positive checking fixtures.
 *
 * tests/README.md: positive tests compile; negative tests assert diagnostic
 * codes and the relevant source spans. Each `.ko` file names the specification
 * rule it demonstrates in a leading comment.
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { build, check, type CompilerHost } from "../src/index.js";
import { normalize, parseExpectedDiagnostics, readFixture, repositoryRoot } from "./fixtures.js";

const root = repositoryRoot();

function hostFor(path: string): CompilerHost {
  return {
    readFile(requested: string): string | null {
      return requested === path ? readFixture(root, path) : null;
    },
  };
}

for (const suite of ["syntax", "types", "diagnostics"]) {
  describe(`${suite} fixtures`, () => {
    const directory = join(root, "tests", suite);
    const sources = readdirSync(directory)
      .filter((name) => name.endsWith(".ko"))
      .sort();

    assert.ok(sources.length > 0, `no fixtures found in tests/${suite}`);

    for (const source of sources) {
      test(source, () => {
        const path = `tests/${suite}/${source}`;
        const expectedFile = join(directory, `${source.slice(0, -3)}.diags`);
        const expected = parseExpectedDiagnostics(readFileSync(expectedFile, "utf8"));

        const result = check(hostFor(path), { path });
        const actual = result.diagnostics.map((diagnostic) => {
          const file = result.files.get(diagnostic.primary.span.file);
          const position = file?.positionOf(diagnostic.primary.span.start);
          return `${diagnostic.code} ${diagnostic.severity} ${position?.line}:${position?.column}`;
        });

        assert.deepEqual(actual, expected);
        // A fixture with no expected errors must be accepted, and one with
        // errors must never produce executable output.
        assert.equal(
          result.ok,
          expected.every((line) => !line.includes(" error ")),
        );
      });
    }
  });
}

describe("compiler phase contract", () => {
  test("a program with errors emits nothing", () => {
    const path = "tests/types/bindings.ko";
    const result = build(hostFor(path), { path });
    assert.equal(result.ok, false);
    assert.equal(result.artifacts.length, 0);
  });

  test("diagnostics are ordered by position", () => {
    const path = "tests/diagnostics/names-and-calls.ko";
    const result = check(hostFor(path), { path });
    const starts = result.diagnostics.map((diagnostic) => diagnostic.primary.span.start);
    assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  });

  test("a missing file is a module resolution diagnostic, not a crash", () => {
    const result = check({ readFile: () => null }, { path: "tests/missing.ko" });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "KODA-M0001");
  });

  test("malformed input does not throw", () => {
    const sources = [
      "fn",
      "fn f(",
      'import { from "koda:io"',
      "export fn main() -> Unit { (((",
      'fn f() -> Int { "unterminated',
      "fn f() -> Int { 1 +",
      "}{}{",
      "fn f() -> Int { /* unclosed",
      "fn f() -> Int { 1__0 }",
      "export fn main() -> Unit { print(é) }",
    ];
    for (const source of sources) {
      const result = check({ readFile: () => source }, { path: "fuzz.ko" });
      assert.equal(result.ok, false, `expected '${source}' to be rejected`);
      assert.ok(result.diagnostics.length > 0);
    }
  });
});

describe("emitted JavaScript", () => {
  const source = 'import { print } from "koda:io"\n\nexport fn main() -> Unit {\n    print("{1 + 2}")\n}\n';

  function buildSource(): string {
    const result = build({ readFile: () => source }, { path: "sample.ko" });
    assert.ok(result.ok, JSON.stringify(result.diagnostics));
    return normalize(result.artifacts[0]!.contents);
  }

  test("is byte-for-byte identical across repeated builds", () => {
    assert.equal(buildSource(), buildSource());
  });

  test("routes checked integer arithmetic through the runtime with a location", () => {
    assert.match(buildSource(), /\$k\.iadd\(1n, 2n, "sample\.ko:4:13"\)/);
  });

  test("invokes the entry only from the launcher", () => {
    const result = build({ readFile: () => source }, { path: "sample.ko" });
    const module = result.artifacts.find((artifact) => artifact.fileName === "sample.js");
    const launcher = result.artifacts.find((artifact) => artifact.fileName === "sample.entry.mjs");
    assert.ok(module && launcher);
    assert.doesNotMatch(module.contents, /^\s*k_main\(\);/m);
    assert.match(launcher.contents, /runEntry\(main\)/);
  });
});
