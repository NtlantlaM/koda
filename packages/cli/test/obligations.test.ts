/** Real CLI checks: JSON, deterministic artifacts, and failed-build isolation. */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cli = join(root, "packages/cli/dist/src/main.js");
const positive = "tests/execution/container-obligations.ko";
const negative = "tests/types/generic-construction-obligations.ko";
function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
}
function artifacts(directory: string): [string, string][] {
  return readdirSync(directory).sort().map((name) => [name, readFileSync(join(directory, name), "utf8")]);
}
function temporary(action: (directory: string) => void): void {
  const prefix = join(tmpdir(), "koda-obligations-cli-");
  const directory = mkdtempSync(prefix);
  try { action(directory); }
  finally {
    assert.ok(resolve(directory).startsWith(resolve(prefix)));
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("structural obligation CLI contracts", () => {
  test("check produces only JSON with source-located structural diagnostics", () => {
    const result = run(["check", negative, "--json"]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(typeof output.schemaVersion, "string");
    assert.equal(result.stdout, run(["check", negative, "--json"]).stdout);
    assert.match(output.diagnostics[3].message, /h.outcome/);
    assert.equal(output.diagnostics[0].code, "KODA-T0012");
    assert.equal(output.diagnostics[3].primary.span.startLine, 24);
    assert.equal(output.diagnostics[0].primary.span.file.replaceAll("\\", "/"), negative);
  });

  test("structural builds are identical and execute", () => {
    temporary((directory) => {
      const first = join(directory, "first");
      const second = join(directory, "second");
      for (const output of [first, second]) {
        const result = run(["build", positive, "--out-dir", output, "--json"]);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout).diagnostics, []);
      }
      assert.deepEqual(artifacts(first), artifacts(second));
      const executed = spawnSync(process.execPath, [join(first, "container-obligations.entry.mjs")], { encoding: "utf8" });
      assert.equal(executed.status, 0, executed.stderr);
      assert.equal(executed.stdout.replaceAll("\r\n", "\n"), readFileSync(join(root, "tests/execution/container-obligations.out"), "utf8").replaceAll("\r\n", "\n"));
    });
  });

  test("failed structural builds create no artifacts and preserve a previous build", () => {
    temporary((directory) => {
      const fresh = join(directory, "fresh");
      assert.equal(run(["build", negative, "--out-dir", fresh, "--json"]).status, 1);
      assert.equal(existsSync(fresh), false);
      const existing = join(directory, "existing");
      assert.equal(run(["build", positive, "--out-dir", existing, "--json"]).status, 0);
      const before = artifacts(existing);
      assert.equal(run(["build", negative, "--out-dir", existing, "--json"]).status, 1);
      assert.deepEqual(artifacts(existing), before);
    });
  });
});
