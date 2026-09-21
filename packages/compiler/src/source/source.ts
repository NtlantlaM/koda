/**
 * Source identity and UTF-8 spans.
 *
 * docs/spec/diagnostics.md requires spans to identify a project-relative file
 * and a half-open UTF-8 *byte* interval, with renderers computing one-based
 * line/column positions for humans. Source text is held as a JavaScript string
 * (UTF-16 code units), so every file carries a byte offset for each UTF-16
 * index and can translate in both directions.
 */

/** A half-open UTF-8 byte interval inside one file. */
export interface Span {
  readonly file: string;
  readonly start: number;
  readonly end: number;
}

/** One-based line and column, where a column counts Unicode scalar values. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

export function spanFrom(file: string, start: number, end: number): Span {
  return { file, start, end };
}

export function joinSpans(a: Span, b: Span): Span {
  return { file: a.file, start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

export function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

export class SourceFile {
  /** Project-relative path, used verbatim in diagnostics. */
  readonly path: string;
  /** Decoded source text. */
  readonly text: string;
  /** byteOffsets[i] is the UTF-8 byte offset of UTF-16 index i; length is text.length + 1. */
  private readonly byteOffsets: Int32Array;
  /** UTF-16 index of the start of each line. */
  private readonly lineStarts: Int32Array;

  constructor(path: string, text: string) {
    this.path = path;
    this.text = text;

    const offsets = new Int32Array(text.length + 1);
    const lines: number[] = [0];
    let bytes = 0;
    for (let i = 0; i < text.length; ) {
      offsets[i] = bytes;
      const cp = text.codePointAt(i)!;
      const units = cp > 0xffff ? 2 : 1;
      if (units === 2) offsets[i + 1] = bytes;
      bytes += utf8Length(cp);
      i += units;
      if (cp === 0x0a) lines.push(i);
    }
    offsets[text.length] = bytes;
    this.byteOffsets = offsets;
    this.lineStarts = Int32Array.from(lines);
  }

  get byteLength(): number {
    return this.byteOffsets[this.text.length]!;
  }

  /** UTF-8 byte offset of a UTF-16 index. */
  byteOffsetOf(charIndex: number): number {
    if (charIndex <= 0) return 0;
    if (charIndex >= this.text.length) return this.byteLength;
    return this.byteOffsets[charIndex]!;
  }

  /** UTF-16 index of a UTF-8 byte offset (lower bound). */
  charIndexOf(byteOffset: number): number {
    let lo = 0;
    let hi = this.text.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.byteOffsets[mid]! < byteOffset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Zero-based line index of a UTF-16 index. */
  lineIndexOf(charIndex: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= charIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  positionOf(byteOffset: number): Position {
    const charIndex = this.charIndexOf(byteOffset);
    const line = this.lineIndexOf(charIndex);
    const lineStart = this.lineStarts[line]!;
    let column = 1;
    for (let i = lineStart; i < charIndex; ) {
      const cp = this.text.codePointAt(i)!;
      i += cp > 0xffff ? 2 : 1;
      column += 1;
    }
    return { line: line + 1, column };
  }

  /** Text of a one-based line without its terminator. */
  lineText(line: number): string {
    const index = line - 1;
    if (index < 0 || index >= this.lineStarts.length) return "";
    const start = this.lineStarts[index]!;
    const end = index + 1 < this.lineStarts.length ? this.lineStarts[index + 1]! : this.text.length;
    return this.text.slice(start, end).replace(/\r?\n$/, "");
  }

  /** Source text covered by a span. */
  textOf(span: Span): string {
    return this.text.slice(this.charIndexOf(span.start), this.charIndexOf(span.end));
  }
}
