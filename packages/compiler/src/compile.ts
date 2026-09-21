/**
 * The compiler's public entry point.
 *
 * docs/architecture/compiler.md sets the boundary this file respects: the
 * compiler has no CLI or process dependency, takes a host interface for reading
 * sources, and returns structured diagnostics and artifacts. The CLI owns file
 * writes, argument parsing and exit codes.
 *
 * It also fixes the phase contract: `check` stops after semantic analysis and
 * `build` emits only after all errors are resolved, so error recovery types
 * cannot reach emitted output.
 */
import { DiagnosticBag, hasErrors, sortDiagnostics, type Diagnostic } from "./diagnostics/diagnostic.js";
import { Codes } from "./diagnostics/codes.js";
import { SourceFile, spanFrom } from "./source/source.js";
import { tokenize } from "./syntax/lexer.js";
import { parseModule } from "./syntax/parser.js";
import { checkModule } from "./check/checker.js";
import { checkObligations } from "./check/obligations.js";
import { emitModule } from "./emit/js.js";

/** Reads sources on the compiler's behalf; the CLI supplies the real one. */
export interface CompilerHost {
  /** Returns the file's text, or null when it cannot be read. */
  readFile(path: string): string | null;
}

export interface CompileOptions {
  /** Project-relative path of the entry module, used verbatim in diagnostics. */
  readonly path: string;
  /** Base name of the emitted module, e.g. "main.js". */
  readonly moduleFileName?: string;
}

export interface Artifact {
  readonly fileName: string;
  readonly contents: string;
}

export interface CompileResult {
  readonly diagnostics: readonly Diagnostic[];
  /** Files referenced by the diagnostics, for rendering. */
  readonly files: ReadonlyMap<string, SourceFile>;
  /** True when no error-severity diagnostic was produced. */
  readonly ok: boolean;
  /** Emitted artifacts; always empty when `ok` is false or nothing was emitted. */
  readonly artifacts: readonly Artifact[];
  /** True when the module declares a valid exported `main`. */
  readonly hasEntry: boolean;
  /** Base name of the generated launcher, when there is an entry. */
  readonly launcherFileName: string | null;
}

function baseName(path: string): string {
  const name = path.replaceAll("\\", "/").split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function compileInternal(host: CompilerHost, options: CompileOptions, emit: boolean): CompileResult {
  const diagnostics = new DiagnosticBag();
  const files = new Map<string, SourceFile>();

  const text = host.readFile(options.path);
  if (text === null) {
    diagnostics.add({
      code: Codes.ModuleResolution,
      message: `cannot read '${options.path}'`,
      span: spanFrom(options.path, 0, 0),
      label: "this file could not be opened",
    });
    return {
      diagnostics: sortDiagnostics(diagnostics.all),
      files,
      ok: false,
      artifacts: [],
      hasEntry: false,
      launcherFileName: null,
    };
  }

  const file = new SourceFile(options.path, text);
  files.set(file.path, file);

  const tokens = tokenize(file, diagnostics);
  const syntax = parseModule(file, tokens, diagnostics);
  const ir = checkModule(file.path, syntax, diagnostics);

  // ADR 0010's must-handle rule is a separate pass over the typed IR. It runs
  // only when ordinary checking succeeded, so every node it sees is real.
  if (!diagnostics.hasErrors) checkObligations(ir, diagnostics);

  const all = sortDiagnostics(diagnostics.all);
  const ok = !hasErrors(all);

  // `build` emits only after all errors are resolved, so an error recovery
  // type can never reach emitted IR.
  if (!ok || !emit) {
    return { diagnostics: all, files, ok, artifacts: [], hasEntry: ir.entry !== null, launcherFileName: null };
  }

  const moduleFileName = options.moduleFileName ?? `${baseName(options.path)}.js`;
  const emitted = emitModule(file, ir, moduleFileName);
  const artifacts: Artifact[] = [{ fileName: moduleFileName, contents: emitted.moduleSource }];
  const launcherFileName = emitted.launcherSource ? `${baseName(moduleFileName)}.entry.mjs` : null;
  if (emitted.launcherSource && launcherFileName) {
    artifacts.push({ fileName: launcherFileName, contents: emitted.launcherSource });
  }

  return { diagnostics: all, files, ok, artifacts, hasEntry: ir.entry !== null, launcherFileName };
}

/** Parses, resolves and type-checks without producing executable output. */
export function check(host: CompilerHost, options: CompileOptions): CompileResult {
  return compileInternal(host, options, false);
}

/** Checks and, when the program is free of errors, emits JavaScript. */
export function build(host: CompilerHost, options: CompileOptions): CompileResult {
  return compileInternal(host, options, true);
}
