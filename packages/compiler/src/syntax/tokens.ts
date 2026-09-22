/** Token model for the slice-0 grammar (ADR 0011). */
import type { Span } from "../source/source.js";

/**
 * Reserved words. docs/spec/syntax.md proposes this list and ADR 0011 keeps
 * `from` contextual. `entity` stays reserved even though entity semantics are
 * deferred. `Decimal` is reserved by ADR 0008 but is not a keyword; it is
 * handled as a reserved prelude name by the checker.
 */
export const KEYWORDS = new Set([
  "as",
  "else",
  "entity",
  "enum",
  "export",
  "false",
  "fn",
  "for",
  "if",
  "import",
  "in",
  "let",
  "match",
  "mut",
  "null",
  "return",
  "true",
  "type",
]);

export type TokenKind =
  | "identifier"
  | "keyword"
  | "int"
  | "float"
  | "string"
  | "punct"
  | "newline"
  | "eof";

/** A piece of a string literal: literal text, or an interpolated expression. */
export type StringPart =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "expr"; readonly span: Span };

export interface Token {
  readonly kind: TokenKind;
  /** Exact source text, preserved for numerals (ADR 0008 S15) and identifiers. */
  readonly text: string;
  readonly span: Span;
  /** Present on string tokens. */
  readonly parts?: readonly StringPart[];
}

export const PUNCTUATION = [
  "->",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ",",
  ":",
  ".",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "?",
] as const;

export function isAsciiLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

export function isAsciiDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

export function isIdentifierStart(ch: string): boolean {
  return isAsciiLetter(ch) || ch === "_";
}

export function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isAsciiDigit(ch);
}
