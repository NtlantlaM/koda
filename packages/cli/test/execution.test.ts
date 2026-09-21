/**
 * Execution fixtures: checked programs with expected Node output and exit
 * status, as tests/README.md requires. These compare observable behaviour, not
 * generated-code formatting.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { build, type CompilerHost } from "@koda/compiler";

function repositoryRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(directory, "tests", "execution"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("cannot locate the repository root");
}

const root = repositoryRoot();
const runtimeSource = join(root, "packages", "runtime", "koda-runtime.mjs");

function normalize(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function hostFor(path: string): CompilerHost {
  return {
    readFile(requested: string): string | null {
      return requested === path ? normalize(readFileSync(join(root, path), "utf8")) : null;
    },
  };
}

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

function compileAndRun(path: string): RunResult {
  const result = build(hostFor(path), { path });
  assert.ok(result.ok, `expected ${path} to compile:\n${JSON.stringify(result.diagnostics, null, 2)}`);
  assert.ok(result.launcherFileName, `expected ${path} to declare an entry`);

  const directory = mkdtempSync(join(tmpdir(), "koda-exec-"));
  try {
    for (const artifact of result.artifacts) {
      writeFileSync(join(directory, artifact.fileName), artifact.contents, "utf8");
    }
    copyFileSync(runtimeSource, join(directory, "koda-runtime.mjs"));

    const child = spawnSync(process.execPath, [join(directory, result.launcherFileName)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      stdout: normalize(child.stdout ?? ""),
      stderr: normalize(child.stderr ?? ""),
      status: child.status ?? -1,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("execution fixtures", () => {
  const directory = join(root, "tests", "execution");
  const sources = readdirSync(directory)
    .filter((name) => name.endsWith(".ko"))
    .sort();

  assert.ok(sources.length > 0, "no execution fixtures found");

  for (const source of sources) {
    test(source, () => {
      const base = source.slice(0, -3);
      const expectedOutput = normalize(readFileSync(join(directory, `${base}.out`), "utf8"));
      const exitFile = join(directory, `${base}.exit`);
      const expectedStatus = existsSync(exitFile) ? Number.parseInt(readFileSync(exitFile, "utf8").trim(), 10) : 0;

      const result = compileAndRun(`tests/execution/${source}`);
      assert.equal(result.stdout, expectedOutput, result.stderr);
      assert.equal(result.status, expectedStatus, result.stderr);
    });
  }
});

describe("runtime failure reporting", () => {
  test("a checked fault names its source location and fails the process", () => {
    const result = compileAndRun("tests/execution/checked-faults.ko");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /divides by zero/);
    assert.match(result.stderr, /tests\/execution\/checked-faults\.ko:7:5/);
    // Output produced before the fault is kept; output after it is not.
    assert.equal(result.stdout.includes("never reached"), false);
  });
});
