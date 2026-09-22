/**
 * Hand-written lexer for the slice-0 subset of ADR 0011's accepted surface.
 *
 * Accepted rules implemented here:
 *   - UTF-8 source, ASCII identifiers (ADR 0011, "Identifiers").
 *   - `//` line comments and non-nesting block comments.
 *   - Significant newlines: a newline token is produced so the parser can end
 *     complete statements. Newlines inside grouping/list/call delimiters are
 *     suppressed by the lexer's delimiter depth, matching ADR 0011's rule.
 *   - Double-quoted strings with escapes and `{expression}` interpolation.
 *   - Integer literals in decimal/binary/octal/hex with `_` separators, and
 *     decimal-point/exponent Float forms. Exact source text is preserved so the
 *     checker can apply ADR 0008's contextual literal typing.
 *
 * Deliberately not lexed, because the accepted decisions do not yet fix them:
 *   - Triple-quoted multiline strings. ADR 0011 accepts the feature but the
 *     common-indentation algorithm is an explicit Q01 follow-up, so the lexer
 *     reports KODA-U0001 instead of inventing one.
 */
import type { DiagnosticBag } from "../diagnostics/diagnostic.js";
import { Codes, type DiagnosticCode } from "../diagnostics/codes.js";
import { SourceFile, spanFrom, utf8Length, type Span } from "../source/source.js";
import {
  KEYWORDS,
  PUNCTUATION,
  isAsciiDigit,
  isIdentifierPart,
  isIdentifierStart,
  type StringPart,
  type Token,
} from "./tokens.js";

const BACKSLASH = "\\";

const ESCAPES = new Map<string, string>([
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ['"', '"'],
  [BACKSLASH, BACKSLASH],
  // Accepted 2026-09-20 as the Q01 follow-up detail ADR 0011 delegated to the
  // string lexical rules; see docs/spec/syntax.md.
  ["{", "{"],
  ["}", "}"],
]);

const ESCAPE_HELP = "Koda v0.1 strings support \\n, \\r, \\t, \\\", \\\\, \\{ and \\}";

export interface LexResult {
  readonly tokens: readonly Token[];
}

export class Lexer {
  private readonly file: SourceFile;
  private readonly diagnostics: DiagnosticBag;
  private index: number;
  private byte: number;
  private readonly endIndex: number;
  /** Depth of () and [] delimiters; newlines inside them are not significant. */
  private groupDepth = 0;
  /** Braces restore statement/list layout; closing them restores the outer group. */
  private readonly braceGroups: number[] = [];

  constructor(file: SourceFile, diagnostics: DiagnosticBag, startIndex = 0, endIndex?: number) {
    this.file = file;
    this.diagnostics = diagnostics;
    this.index = startIndex;
    this.byte = file.byteOffsetOf(startIndex);
    this.endIndex = endIndex ?? file.text.length;
  }

  private get atEnd(): boolean {
    return this.index >= this.endIndex;
  }

  private peek(offset = 0): string {
    const i = this.index + offset;
    return i < this.endIndex ? this.file.text[i]! : "";
  }

  private advance(): string {
    const cp = this.file.text.codePointAt(this.index)!;
    const units = cp > 0xffff ? 2 : 1;
    const ch = this.file.text.slice(this.index, this.index + units);
    this.index += units;
    this.byte += utf8Length(cp);
    return ch;
  }

  private span(startByte: number): Span {
    return spanFrom(this.file.path, startByte, this.byte);
  }

  private error(code: DiagnosticCode, message: string, span: Span, label: string, notes: string[] = []): void {
    this.diagnostics.add({ code, message, span, label, notes });
  }

  tokenize(): LexResult {
    const tokens: Token[] = [];
    for (;;) {
      const token = this.next();
      tokens.push(token);
      if (token.kind === "eof") break;
    }
    return { tokens };
  }

  private next(): Token {
    for (;;) {
      if (this.atEnd) {
        const startByte = this.byte;
        return { kind: "eof", text: "", span: this.span(startByte) };
      }
      const ch = this.peek();

      if (ch === "\n" || ch === "\r") {
        const startByte = this.byte;
        if (ch === "\r" && this.peek(1) === "\n") this.advance();
        this.advance();
        if (this.groupDepth > 0) continue;
        return { kind: "newline", text: "\n", span: this.span(startByte) };
      }
      if (ch === " " || ch === "\t") {
        this.advance();
        continue;
      }
      if (ch === "/" && this.peek(1) === "/") {
        while (!this.atEnd && this.peek() !== "\n" && this.peek() !== "\r") this.advance();
        continue;
      }
      if (ch === "/" && this.peek(1) === "*") {
        this.skipBlockComment();
        continue;
      }
      return this.scanToken();
    }
  }

  /** Block comments do not nest in v0.1 (ADR 0011). */
  private skipBlockComment(): void {
    const startByte = this.byte;
    this.advance();
    this.advance();
    while (!this.atEnd) {
      if (this.peek() === "*" && this.peek(1) === "/") {
        this.advance();
        this.advance();
        return;
      }
      this.advance();
    }
    this.error(
      Codes.UnexpectedToken,
      "block comment is never closed",
      this.span(startByte),
      "this comment reaches the end of the file",
      ["a block comment ends at the first '*/'; block comments do not nest in Koda v0.1"],
    );
  }

  private scanToken(): Token {
    const startByte = this.byte;
    const ch = this.peek();

    if (isIdentifierStart(ch)) return this.scanIdentifier(startByte);
    if (isAsciiDigit(ch)) return this.scanNumber(startByte);
    if (ch === '"') return this.scanString(startByte);

    for (const punct of PUNCTUATION) {
      if (this.matches(punct)) {
        for (let i = 0; i < punct.length; i += 1) this.advance();
        if (punct === "(" || punct === "[") this.groupDepth += 1;
        if (punct === ")" || punct === "]") this.groupDepth = Math.max(0, this.groupDepth - 1);
        if (punct === "{") {
          this.braceGroups.push(this.groupDepth);
          this.groupDepth = 0;
        }
        if (punct === "}") this.groupDepth = this.braceGroups.pop() ?? 0;
        return { kind: "punct", text: punct, span: this.span(startByte) };
      }
    }

    const bad = this.advance();
    const span = this.span(startByte);
    const notes =
      bad.codePointAt(0)! > 0x7f
        ? ["Koda v0.1 identifiers are ASCII; Unicode is allowed in strings and comments (ADR 0011)"]
        : [];
    this.error(
      Codes.UnexpectedToken,
      `unexpected character ${JSON.stringify(bad)}`,
      span,
      "this character does not start any Koda token",
      notes,
    );
    return { kind: "punct", text: bad, span };
  }

  private matches(text: string): boolean {
    for (let i = 0; i < text.length; i += 1) {
      if (this.peek(i) !== text[i]) return false;
    }
    return true;
  }

  private scanIdentifier(startByte: number): Token {
    let text = "";
    while (!this.atEnd && isIdentifierPart(this.peek())) text += this.advance();
    const span = this.span(startByte);
    return { kind: KEYWORDS.has(text) ? "keyword" : "identifier", text, span };
  }

  /**
   * Scans an integer or Float numeral and keeps its exact source text.
   * ADR 0008 S15 requires the exact source literal to survive until contextual
   * or default typing, so no numeric value is computed here.
   */
  private scanNumber(startByte: number): Token {
    let text = "";
    const takeDigits = (accept: (ch: string) => boolean): number => {
      let count = 0;
      for (;;) {
        const ch = this.peek();
        if (ch !== "" && accept(ch)) {
          text += this.advance();
          count += 1;
          continue;
        }
        if (ch === "_") {
          // A separator must sit inside a run of digits (ADR 0008 S09).
          const previous = text.at(-1) ?? "";
          const following = this.peek(1);
          if (previous === "" || !accept(previous) || following === "" || !accept(following)) {
            const badByte = this.byte;
            this.advance();
            this.error(
              Codes.InvalidLiteral,
              "'_' must separate digits inside a number",
              this.span(badByte),
              "this separator is not between two digits",
              ["write 1_000_000, not 1__000 or 1_000_"],
            );
            continue;
          }
          text += this.advance();
          continue;
        }
        return count;
      }
    };

    if (this.peek() === "0" && /[bBoOxX]/.test(this.peek(1))) {
      text += this.advance();
      const prefix = this.advance();
      text += prefix;
      const lower = prefix.toLowerCase();
      const accept =
        lower === "b"
          ? (ch: string): boolean => ch === "0" || ch === "1"
          : lower === "o"
            ? (ch: string): boolean => ch >= "0" && ch <= "7"
            : (ch: string): boolean => isAsciiDigit(ch) || /[a-fA-F]/.test(ch);
      const count = takeDigits(accept);
      const span = this.span(startByte);
      if (count === 0) {
        this.error(
          Codes.InvalidLiteral,
          `numeric literal '${text}' has no digits`,
          span,
          "a base prefix must be followed by digits",
          ["for example 0b1010, 0o755 or 0xFF"],
        );
      }
      this.rejectTrailingIdentifier(text);
      return { kind: "int", text, span };
    }

    takeDigits(isAsciiDigit);
    let isFloat = false;
    // A '.' starts a Float fraction only when a digit follows; otherwise it is
    // a field access token and must not be absorbed into the numeral.
    if (this.peek() === "." && isAsciiDigit(this.peek(1))) {
      isFloat = true;
      text += this.advance();
      takeDigits(isAsciiDigit);
    }
    if (/[eE]/.test(this.peek())) {
      const digitOffset = /[+-]/.test(this.peek(1)) ? 2 : 1;
      if (isAsciiDigit(this.peek(digitOffset))) {
        isFloat = true;
        text += this.advance();
        if (/[+-]/.test(this.peek())) text += this.advance();
        takeDigits(isAsciiDigit);
      }
    }
    const span = this.span(startByte);
    this.rejectTrailingIdentifier(text);
    return { kind: isFloat ? "float" : "int", text, span };
  }

  /** ADR 0008 does not add typed numeric suffixes to v0.1. */
  private rejectTrailingIdentifier(text: string): void {
    if (this.atEnd || !isIdentifierStart(this.peek())) return;
    const startByte = this.byte;
    let suffix = "";
    while (!this.atEnd && isIdentifierPart(this.peek())) suffix += this.advance();
    this.error(
      Codes.InvalidLiteral,
      `'${suffix}' is not a valid suffix on the number '${text}'`,
      this.span(startByte),
      "a number cannot be followed directly by a name",
      ["Koda v0.1 has no typed numeric suffixes (ADR 0008); insert a space or an operator"],
    );
  }

  private scanString(startByte: number): Token {
    if (this.matches('"""')) {
      while (!this.atEnd && this.peek() !== "\n") this.advance();
      const span = this.span(startByte);
      this.error(
        Codes.Unsupported,
        "multiline strings are not available in this compiler slice",
        span,
        "triple-quoted strings are not supported yet",
        [
          "ADR 0011 accepts multiline strings, but their common-indentation algorithm is an explicit Q01 follow-up and is not specified yet",
          "use a double-quoted string for now",
        ],
      );
      return { kind: "string", text: "", span, parts: [] };
    }

    this.advance();
    const parts: StringPart[] = [];
    let text = "";
    const flush = (): void => {
      if (text.length > 0) {
        parts.push({ kind: "text", value: text });
        text = "";
      }
    };

    for (;;) {
      if (this.atEnd || this.peek() === "\n" || this.peek() === "\r") {
        const span = this.span(startByte);
        this.error(
          Codes.InvalidLiteral,
          "string literal is never closed",
          span,
          "this string reaches the end of the line",
          ['a double-quoted string must close with " on the same line'],
        );
        flush();
        return { kind: "string", text: "", span, parts };
      }
      if (this.peek() === '"') {
        this.advance();
        flush();
        return { kind: "string", text: "", span: this.span(startByte), parts };
      }
      if (this.peek() === BACKSLASH) {
        const escapeByte = this.byte;
        this.advance();
        const escaped = this.atEnd ? "" : this.advance();
        const value = ESCAPES.get(escaped);
        if (value === undefined) {
          this.error(
            Codes.InvalidLiteral,
            `unknown escape '${BACKSLASH}${escaped}'`,
            this.span(escapeByte),
            "this escape sequence is not recognised",
            [ESCAPE_HELP],
          );
        } else {
          text += value;
        }
        continue;
      }
      if (this.peek() === "{") {
        flush();
        parts.push(this.scanInterpolation());
        continue;
      }
      text += this.advance();
    }
  }

  /** Captures the span of a `{expression}` hole; the parser parses it later. */
  private scanInterpolation(): StringPart {
    const openByte = this.byte;
    this.advance();
    const exprStartByte = this.byte;
    let depth = 1;
    for (;;) {
      if (this.atEnd || this.peek() === "\n" || this.peek() === "\r") {
        this.error(
          Codes.InvalidLiteral,
          "interpolation is never closed",
          this.span(openByte),
          "this '{' has no matching '}'",
          ['write "Hello {name}", and escape a literal brace as \\{'],
        );
        return { kind: "expr", span: spanFrom(this.file.path, exprStartByte, this.byte) };
      }
      const ch = this.peek();
      if (ch === '"') {
        // A nested string keeps its own braces out of the depth count.
        this.advance();
        while (!this.atEnd && this.peek() !== '"' && this.peek() !== "\n") {
          if (this.peek() === BACKSLASH) this.advance();
          this.advance();
        }
        if (!this.atEnd && this.peek() === '"') this.advance();
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const endByte = this.byte;
          this.advance();
          return { kind: "expr", span: spanFrom(this.file.path, exprStartByte, endByte) };
        }
      }
      this.advance();
    }
  }
}

export function tokenize(file: SourceFile, diagnostics: DiagnosticBag): readonly Token[] {
  return new Lexer(file, diagnostics).tokenize().tokens;
}
