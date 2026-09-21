/**
 * Public surface of the Koda compiler.
 *
 * Tools depend on this module; it depends on nothing outside the compiler.
 */
export { check, build } from "./compile.js";
export type { Artifact, CompileOptions, CompileResult, CompilerHost } from "./compile.js";

export { Codes } from "./diagnostics/codes.js";
export type { DiagnosticCode } from "./diagnostics/codes.js";
export type { Diagnostic, Label, Severity, SuggestedEdit } from "./diagnostics/diagnostic.js";
export { sortDiagnostics, hasErrors } from "./diagnostics/diagnostic.js";
export {
  DEFAULT_DIAGNOSTIC_LIMIT,
  DIAGNOSTIC_SCHEMA_VERSION,
  renderHuman,
  renderJson,
} from "./diagnostics/render.js";

export { SourceFile, spanFrom, joinSpans } from "./source/source.js";
export type { Position, Span } from "./source/source.js";
