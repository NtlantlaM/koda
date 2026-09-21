/**
 * Shared helpers for the conformance fixtures under the repository's `tests/`
 * directory. tests/README.md keeps cross-phase fixtures there rather than
 * inside a package.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Walks up from the compiled test file to the repository root. */
export function repositoryRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(directory, "tests", "execution"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("cannot locate the repository root");
}

/** Fixtures are authored with LF; Windows tools may hand back CRLF. */
export function normalize(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

export function readFixture(root: string, relativePath: string): string {
  return normalize(readFileSync(resolve(root, relativePath), "utf8"));
}

/** A `.diags` file records one `CODE severity line:column` line per diagnostic. */
export function parseExpectedDiagnostics(text: string): string[] {
  return normalize(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}
