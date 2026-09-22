/**
 * The single `koda` command.
 *
 * docs/architecture/compiler.md gives the CLI file writes, argument parsing,
 * process execution and exit codes, and requires it to stage output rather than
 * replace a valid build with partial artifacts.
 *
 * Everything about this surface is provisional. Q05 (projects and modules) and
 * Q07 (tool contracts and entry points) are both unresolved, so this command
 * takes an explicit `.ko` path instead of reading a manifest, and its exit
 * codes are the ones documented in docs/implementation/slice-0.md rather than
 * an accepted contract.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { build, check, renderHuman, renderJson, type CompileResult, type CompilerHost } from "@koda/compiler";

/** Provisional exit codes; Q07 owns the real contract. */
const EXIT_OK = 0;
const EXIT_DIAGNOSTICS = 1;
const EXIT_USAGE = 2;

const RUNTIME_FILE = "koda-runtime.mjs";

const USAGE = `koda - the Koda toolchain (compiler slice 3A)

usage:
  koda check <file.ko> [--json]
  koda build <file.ko> [--out-dir <dir>] [--json]
  koda run   <file.ko> [--out-dir <dir>] [--json]

options:
  --out-dir <dir>   where to write generated JavaScript (default: dist)
  --json            emit diagnostics as JSON on stdout instead of text on stderr

This compiles one self-contained .ko module: records, enums, enum and nullable
matching, generic data types and their construction, Result values with
must-handle enforcement. Generic functions and calls, relative imports and npm
interop are not implemented; see docs/implementation/slice-3a.md.`;

interface Options {
  readonly command: "check" | "build" | "run";
  readonly file: string;
  readonly outDir: string;
  readonly json: boolean;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(EXIT_USAGE);
}

function parseArguments(argv: readonly string[]): Options {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(`${USAGE}\n`);
    process.exit(EXIT_OK);
  }
  if (command !== "check" && command !== "build" && command !== "run") {
    fail(`unknown command '${command}'`);
  }

  let file: string | null = null;
  let outDir = "dist";
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--out-dir") {
      const value = rest[index + 1];
      if (!value) fail("--out-dir needs a directory");
      outDir = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) fail(`unknown option '${argument}'`);
    if (file) fail("this slice compiles one file at a time");
    file = argument;
  }

  if (!file) fail(`'${command}' needs a .ko file`);
  if (!file.endsWith(".ko")) fail(`'${file}' is not a .ko file`);
  return { command, file, outDir, json };
}

/** Paths in diagnostics stay relative to the working directory. */
function displayPath(file: string): string {
  const absolute = resolve(file);
  const related = relative(process.cwd(), absolute);
  const useRelative = related !== "" && !related.startsWith("..") && !isAbsolute(related);
  return (useRelative ? related : absolute).split(sep).join("/");
}

function createHost(displayed: string, absolute: string): CompilerHost {
  return {
    readFile(path: string): string | null {
      if (path !== displayed) return null;
      try {
        return readFileSync(absolute, "utf8");
      } catch {
        return null;
      }
    },
  };
}

function report(result: CompileResult, json: boolean): void {
  if (json) {
    // JSON output must not carry terminal progress text (docs/spec/diagnostics.md).
    process.stdout.write(`${renderJson(result.diagnostics, result.files)}\n`);
    return;
  }
  if (result.diagnostics.length === 0) return;
  process.stderr.write(`${renderHuman(result.diagnostics, result.files)}\n`);
}

function runtimeSourcePath(): string {
  try {
    return createRequire(import.meta.url).resolve("@koda/runtime");
  } catch {
    // Fall back to the workspace layout when the package is not linked.
    let directory = dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 8; depth += 1) {
      const candidate = join(directory, "packages", "runtime", RUNTIME_FILE);
      if (existsSync(candidate)) return candidate;
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    throw new Error(`cannot locate ${RUNTIME_FILE}`);
  }
}

/**
 * Writes the build into a staging directory and moves each file into place, so
 * a failed build cannot leave a half-replaced output directory behind.
 */
function writeArtifacts(result: CompileResult, outDir: string): void {
  const target = resolve(outDir);
  const staging = join(target, ".koda-staging");
  mkdirSync(staging, { recursive: true });
  try {
    for (const artifact of result.artifacts) {
      writeFileSync(join(staging, artifact.fileName), artifact.contents, "utf8");
    }
    copyFileSync(runtimeSourcePath(), join(staging, RUNTIME_FILE));

    for (const name of [...result.artifacts.map((artifact) => artifact.fileName), RUNTIME_FILE]) {
      renameSync(join(staging, name), join(target, name));
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function main(argv: readonly string[]): number {
  const options = parseArguments(argv);
  const absolute = resolve(options.file);
  const displayed = displayPath(options.file);
  const host = createHost(displayed, absolute);

  if (options.command === "check") {
    const result = check(host, { path: displayed });
    report(result, options.json);
    return result.ok ? EXIT_OK : EXIT_DIAGNOSTICS;
  }

  const result = build(host, { path: displayed });
  report(result, options.json);
  if (!result.ok) return EXIT_DIAGNOSTICS;

  writeArtifacts(result, options.outDir);
  if (options.command === "build") return EXIT_OK;

  if (!result.launcherFileName) {
    process.stderr.write("error: this module has no entry to run\nnote: add `export fn main() -> Unit { ... }`\n");
    return EXIT_DIAGNOSTICS;
  }

  const launcher = join(resolve(options.outDir), result.launcherFileName);
  const child = spawnSync(process.execPath, [launcher], { stdio: "inherit" });
  if (child.error) {
    process.stderr.write(`error: could not start Node: ${child.error.message}\n`);
    return EXIT_DIAGNOSTICS;
  }
  return child.status ?? EXIT_DIAGNOSTICS;
}

process.exitCode = main(process.argv.slice(2));
