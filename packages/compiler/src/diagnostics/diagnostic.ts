/**
 * The shared diagnostic model required by ADR 0004 and docs/spec/diagnostics.md:
 * stable code, severity, concise message, primary span, labelled secondary
 * spans, notes and optional suggested edits with an applicability field.
 * Suggested edits are never applied during ordinary checking.
 */
import type { Span } from "../source/source.js";
import type { DiagnosticCode } from "./codes.js";

export type Severity = "error" | "warning" | "info";

/** Distinguishes a mechanically safe edit from one needing human judgement. */
export type Applicability = "machine-applicable" | "needs-review";

export interface Label {
  readonly span: Span;
  readonly message: string;
}

export interface SuggestedEdit {
  readonly message: string;
  readonly span: Span;
  readonly replacement: string;
  readonly applicability: Applicability;
}

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly message: string;
  readonly primary: Label;
  readonly secondary: readonly Label[];
  readonly notes: readonly string[];
  readonly suggestions: readonly SuggestedEdit[];
}

export interface DiagnosticInit {
  readonly code: DiagnosticCode;
  readonly severity?: Severity;
  readonly message: string;
  readonly span: Span;
  /** Short text rendered under the primary caret. */
  readonly label?: string;
  readonly secondary?: readonly Label[];
  readonly notes?: readonly string[];
  readonly suggestions?: readonly SuggestedEdit[];
}

export function makeDiagnostic(init: DiagnosticInit): Diagnostic {
  return {
    code: init.code,
    severity: init.severity ?? "error",
    message: init.message,
    primary: { span: init.span, message: init.label ?? "" },
    secondary: init.secondary ?? [],
    notes: init.notes ?? [],
    suggestions: init.suggestions ?? [],
  };
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Deterministic order by file, position, severity, then code. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const fileOrder = a.primary.span.file.localeCompare(b.primary.span.file);
    if (fileOrder !== 0) return fileOrder;
    if (a.primary.span.start !== b.primary.span.start) {
      return a.primary.span.start - b.primary.span.start;
    }
    if (a.primary.span.end !== b.primary.span.end) return a.primary.span.end - b.primary.span.end;
    const severityOrder = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityOrder !== 0) return severityOrder;
    return a.code.localeCompare(b.code);
  });
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

/** Collects diagnostics during a phase. */
export class DiagnosticBag {
  private readonly items: Diagnostic[] = [];

  add(init: DiagnosticInit): void {
    this.items.push(makeDiagnostic(init));
  }

  push(diagnostic: Diagnostic): void {
    this.items.push(diagnostic);
  }

  extend(diagnostics: readonly Diagnostic[]): void {
    this.items.push(...diagnostics);
  }

  get all(): readonly Diagnostic[] {
    return this.items;
  }

  get hasErrors(): boolean {
    return hasErrors(this.items);
  }
}
