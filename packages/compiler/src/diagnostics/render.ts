/**
 * Human and machine renderings of the shared diagnostic model.
 *
 * docs/spec/diagnostics.md requires both, requires them to agree, requires a
 * schemaVersion on machine output, and forbids mixing terminal progress text
 * into the JSON stream. Rendering detail remains a Q07 decision; this module
 * implements the shape shown in that document.
 */
import type { SourceFile, Span } from "../source/source.js";
import type { Diagnostic } from "./diagnostic.js";
import { sortDiagnostics } from "./diagnostic.js";

/** Provisional. Q07 owns the final schema and its versioning policy. */
export const DIAGNOSTIC_SCHEMA_VERSION = "0.0.0-slice0";

/** docs/spec/diagnostics.md requires capping output with a count of omissions. */
export const DEFAULT_DIAGNOSTIC_LIMIT = 25;

export interface RenderOptions {
  readonly limit?: number;
  readonly color?: boolean;
}

function caretLine(file: SourceFile, span: Span, gutter: number, message: string): string[] {
  const start = file.positionOf(span.start);
  const end = file.positionOf(span.end);
  const text = file.lineText(start.line);
  const width = end.line === start.line ? Math.max(1, end.column - start.column) : Math.max(1, [...text].length - start.column + 1);
  const pad = " ".repeat(gutter);
  const lineNumber = String(start.line).padStart(gutter);
  const underline = `${" ".repeat(start.column - 1)}${"^".repeat(width)}`;
  const lines = [`${lineNumber} | ${text}`, `${pad} | ${underline}${message ? ` ${message}` : ""}`];
  return lines;
}

function renderOne(diagnostic: Diagnostic, files: ReadonlyMap<string, SourceFile>): string {
  const file = files.get(diagnostic.primary.span.file);
  const out: string[] = [];
  out.push(`${diagnostic.severity}[${diagnostic.code}]: ${diagnostic.message}`);
  if (!file) {
    out.push(`  --> ${diagnostic.primary.span.file}`);
    return out.join("\n");
  }
  const position = file.positionOf(diagnostic.primary.span.start);
  // The layout follows the example in docs/spec/diagnostics.md: the line-number
  // gutter is as wide as the number, and the location arrow is indented to sit
  // just past it.
  const gutter = String(position.line).length;
  out.push(`${" ".repeat(gutter + 1)}--> ${file.path}:${position.line}:${position.column}`);
  out.push(...caretLine(file, diagnostic.primary.span, gutter, diagnostic.primary.message));
  for (const label of diagnostic.secondary) {
    const secondaryFile = files.get(label.span.file);
    if (!secondaryFile) continue;
    const secondaryPosition = secondaryFile.positionOf(label.span.start);
    out.push(`note: ${label.message} at ${secondaryFile.path}:${secondaryPosition.line}:${secondaryPosition.column}`);
  }
  for (const note of diagnostic.notes) out.push(`note: ${note}`);
  for (const suggestion of diagnostic.suggestions) out.push(`help: ${suggestion.message}`);
  return out.join("\n");
}

export function renderHuman(
  diagnostics: readonly Diagnostic[],
  files: ReadonlyMap<string, SourceFile>,
  options: RenderOptions = {},
): string {
  const limit = options.limit ?? DEFAULT_DIAGNOSTIC_LIMIT;
  const sorted = sortDiagnostics(diagnostics);
  const shown = sorted.slice(0, limit);
  const blocks = shown.map((diagnostic) => renderOne(diagnostic, files));
  const omitted = sorted.length - shown.length;
  if (omitted > 0) blocks.push(`${omitted} further diagnostic${omitted === 1 ? "" : "s"} not shown`);
  return blocks.join("\n\n");
}

export interface JsonSpan {
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

function jsonSpan(span: Span, files: ReadonlyMap<string, SourceFile>): JsonSpan {
  const file = files.get(span.file);
  const start = file?.positionOf(span.start) ?? { line: 0, column: 0 };
  const end = file?.positionOf(span.end) ?? { line: 0, column: 0 };
  return {
    file: span.file,
    start: span.start,
    end: span.end,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

export function renderJson(
  diagnostics: readonly Diagnostic[],
  files: ReadonlyMap<string, SourceFile>,
): string {
  const payload = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    diagnostics: sortDiagnostics(diagnostics).map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      primary: { span: jsonSpan(diagnostic.primary.span, files), message: diagnostic.primary.message },
      secondary: diagnostic.secondary.map((label) => ({
        span: jsonSpan(label.span, files),
        message: label.message,
      })),
      notes: diagnostic.notes,
      suggestions: diagnostic.suggestions.map((suggestion) => ({
        message: suggestion.message,
        span: jsonSpan(suggestion.span, files),
        replacement: suggestion.replacement,
        applicability: suggestion.applicability,
      })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}
