/**
 * Recursive-descent declarations/statements with a Pratt expression parser,
 * as docs/architecture/compiler.md prescribes for the initial implementation.
 *
 * Layout rules come from ADR 0011:
 *   - A newline ends a complete statement, except inside grouping/list/call
 *     delimiters (handled by the lexer) or after a binary operator, which is
 *     why newlines are skipped only after consuming an operator.
 *   - Nested block braces restore statement context.
 *   - A newline immediately after bare `return` does not capture the following
 *     expression.
 *   - `else` must follow the closing brace of its `if` on the same line,
 *     because the preceding `if` block is already a complete statement.
 *
 * Constructs that the accepted decisions define but this slice does not
 * implement are reported as KODA-U0001 rather than parsed approximately.
 */
import { Codes } from "../diagnostics/codes.js";
import type { DiagnosticBag } from "../diagnostics/diagnostic.js";
import { SourceFile, joinSpans, spanFrom, type Span } from "../source/source.js";
import { Lexer } from "./lexer.js";
import type { Token } from "./tokens.js";
import type {
  BinaryOperator,
  Block,
  Declaration,
  EnumDecl,
  Expression,
  FieldDecl,
  FieldInit,
  FunctionDecl,
  IfExpression,
  ImportDecl,
  MatchArm,
  MemberExpression,
  Module,
  NameExpression,
  Parameter,
  Pattern,
  Statement,
  StringLiteralPart,
  TypeDecl,
  TypeRef,
  VariantDecl,
} from "./ast.js";

/** Binding powers, lowest first, matching docs/spec/syntax.md's table. */
const BINARY_PRECEDENCE: Record<BinaryOperator, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

/** Ordering and equality do not chain associatively (ADR 0011). */
const NON_ASSOCIATIVE = new Set<number>([3, 4]);

const UNSUPPORTED_KEYWORDS: Record<string, { feature: string; note: string }> = {
  entity: {
    feature: "entity declarations",
    note: "`entity` is reserved; persistence is excluded from v0.1 and remains unresolved under Q09",
  },
};

export class Parser {
  private readonly file: SourceFile;
  private readonly tokens: readonly Token[];
  private readonly diagnostics: DiagnosticBag;
  private position = 0;
  /**
   * True while parsing a control-structure head, where ADR 0011 restricts
   * direct record literals so that `if flag {` cannot read as a construction.
   * Parentheses and argument lists clear it again.
   */
  private suppressRecordLiteral = false;

  constructor(file: SourceFile, tokens: readonly Token[], diagnostics: DiagnosticBag) {
    this.file = file;
    this.tokens = tokens;
    this.diagnostics = diagnostics;
  }

  // ---------------------------------------------------------------- utilities

  private get current(): Token {
    return this.tokens[Math.min(this.position, this.tokens.length - 1)]!;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.position + offset, this.tokens.length - 1)]!;
  }

  private get atEnd(): boolean {
    return this.current.kind === "eof";
  }

  private advance(): Token {
    const token = this.current;
    if (!this.atEnd) this.position += 1;
    return token;
  }

  private isPunct(text: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.kind === "punct" && token.text === text;
  }

  private isKeyword(text: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.kind === "keyword" && token.text === text;
  }

  private skipNewlines(): void {
    while (this.current.kind === "newline") this.position += 1;
  }

  private describe(token: Token): string {
    switch (token.kind) {
      case "eof":
        return "end of file";
      case "newline":
        return "end of line";
      case "string":
        return "a string literal";
      case "int":
      case "float":
        return `the number '${token.text}'`;
      default:
        return `'${token.text}'`;
    }
  }

  private expectPunct(text: string, context: string): Token | null {
    if (this.isPunct(text)) return this.advance();
    this.error(`expected '${text}' ${context}`, this.current.span, `found ${this.describe(this.current)}`);
    return null;
  }

  private error(message: string, span: Span, label: string, notes: string[] = []): void {
    this.diagnostics.add({ code: Codes.UnexpectedToken, message, span, label, notes });
  }

  private unsupported(message: string, span: Span, label: string, notes: string[]): void {
    this.diagnostics.add({ code: Codes.Unsupported, message, span, label, notes });
  }

  /** Skips to the start of the next line or the end of the enclosing block. */
  private recoverToStatementBoundary(): void {
    let depth = 0;
    while (!this.atEnd) {
      if (this.current.kind === "newline" && depth === 0) return;
      if (this.isPunct("{")) depth += 1;
      if (this.isPunct("}")) {
        if (depth === 0) return;
        depth -= 1;
      }
      this.position += 1;
    }
  }

  // ------------------------------------------------------------------ module

  parseModule(): Module {
    const imports: ImportDecl[] = [];
    const declarations: Declaration[] = [];

    for (;;) {
      this.skipNewlines();
      if (this.atEnd) break;

      if (this.isKeyword("import")) {
        const declaration = this.parseImport();
        if (declaration) imports.push(declaration);
        continue;
      }

      const exported = this.isKeyword("export");
      const exportToken = exported ? this.advance() : null;

      const start = exportToken?.span ?? this.current.span;

      if (this.isKeyword("fn")) {
        const declaration = this.parseFunction(exported, exportToken?.span ?? null);
        if (declaration) declarations.push(declaration);
        continue;
      }
      if (this.isKeyword("type")) {
        const declaration = this.parseTypeDecl(exported, start);
        if (declaration) declarations.push(declaration);
        continue;
      }
      if (this.isKeyword("enum")) {
        const declaration = this.parseEnumDecl(exported, start);
        if (declaration) declarations.push(declaration);
        continue;
      }

      const unsupported = this.current.kind === "keyword" ? UNSUPPORTED_KEYWORDS[this.current.text] : undefined;
      if (unsupported) {
        this.unsupported(
          `${unsupported.feature} are not available in this compiler slice`,
          this.current.span,
          `'${this.current.text}' is not supported yet`,
          [unsupported.note, "see docs/implementation/slice-0.md for the supported subset"],
        );
        this.skipDeclaration();
        continue;
      }

      this.error("expected a declaration", this.current.span, `found ${this.describe(this.current)}`, [
        "a Koda module contains imports and `fn`, `type` or `enum` declarations; top-level statements are not allowed",
      ]);
      this.skipDeclaration();
    }

    return { imports, declarations };
  }

  /** Consumes a declaration's head and its brace-balanced body, if any. */
  private skipDeclaration(): void {
    while (!this.atEnd && !this.isPunct("{") && this.current.kind !== "newline") this.position += 1;
    if (this.isPunct("{")) {
      let depth = 0;
      do {
        if (this.isPunct("{")) depth += 1;
        else if (this.isPunct("}")) depth -= 1;
        this.position += 1;
      } while (!this.atEnd && depth > 0);
      return;
    }
    this.recoverToStatementBoundary();
  }

  private parseImport(): ImportDecl | null {
    const start = this.advance().span;
    if (!this.expectPunct("{", "after 'import'")) {
      this.recoverToStatementBoundary();
      return null;
    }
    const names: { name: string; span: Span }[] = [];
    this.skipNewlines();
    while (!this.isPunct("}") && !this.atEnd) {
      this.skipNewlines();
      if (this.current.kind !== "identifier") {
        this.error("expected an imported name", this.current.span, `found ${this.describe(this.current)}`);
        this.recoverToStatementBoundary();
        return null;
      }
      const token = this.advance();
      names.push({ name: token.text, span: token.span });
      this.skipNewlines();
      if (this.isPunct(",")) {
        this.advance();
        this.skipNewlines();
      }
    }
    if (!this.expectPunct("}", "to close the imported names")) return null;

    // `from` is contextual (ADR 0011), so it arrives as an ordinary identifier.
    if (this.current.kind !== "identifier" || this.current.text !== "from") {
      this.error("expected 'from' after the imported names", this.current.span, `found ${this.describe(this.current)}`, [
        'an import is written: import { print } from "koda:io"',
      ]);
      this.recoverToStatementBoundary();
      return null;
    }
    this.advance();

    const pathToken = this.current;
    if (pathToken.kind !== "string") {
      this.error("expected a module path in quotes", pathToken.span, `found ${this.describe(pathToken)}`);
      this.recoverToStatementBoundary();
      return null;
    }
    const moduleToken = this.advance();
    const parts = moduleToken.parts ?? [];
    const interpolated = parts.some((part) => part.kind === "expr");
    if (interpolated) {
      this.error("a module path cannot contain interpolation", moduleToken.span, "this path is not a plain string");
    }
    const specifier = interpolated ? "" : parts.map((part) => (part.kind === "text" ? part.value : "")).join("");

    return {
      kind: "import",
      names,
      moduleSpecifier: specifier,
      moduleSpan: moduleToken.span,
      span: joinSpans(start, moduleToken.span),
    };
  }

  /**
   * Parses a brace-delimited list whose entries are separated by a newline or a
   * comma, in either compact or multiline form (ADR 0011). A trailing
   * separator is allowed.
   */
  private parseBracedList<T>(what: string, parseItem: () => T | null): T[] | null {
    if (!this.expectPunct("{", `to open the ${what}`)) {
      this.skipDeclaration();
      return null;
    }
    const items: T[] = [];
    for (;;) {
      this.skipNewlines();
      if (this.isPunct("}") || this.atEnd) break;

      const before = this.position;
      const item = parseItem();
      if (item === null) {
        this.recoverToStatementBoundary();
        if (this.position === before) this.position += 1;
        continue;
      }
      items.push(item);

      if (this.isPunct(",")) {
        this.advance();
        continue;
      }
      if (this.current.kind === "newline" || this.isPunct("}") || this.atEnd) continue;

      this.error(
        `expected a new line or ',' between ${what}`,
        this.current.span,
        `found ${this.describe(this.current)}`,
        [`entries in ${what} are separated by a line break, or by a comma on one line`],
      );
      this.recoverToStatementBoundary();
    }
    if (!this.expectPunct("}", `to close the ${what}`)) return null;
    return items;
  }

  /** `name: Type`, used by record fields and enum variant payloads. */
  private parseFieldDecl(): FieldDecl | null {
    if (this.current.kind !== "identifier") {
      this.error("expected a field name", this.current.span, `found ${this.describe(this.current)}`, [
        "a field is written `name: Type`",
      ]);
      return null;
    }
    const nameToken = this.advance();
    if (!this.expectPunct(":", "after the field name")) return null;
    const type = this.parseTypeRef();
    if (!type) return null;
    return { name: nameToken.text, nameSpan: nameToken.span, type, span: joinSpans(nameToken.span, type.span) };
  }

  /** Rejects type parameters uniformly; generics are outside this slice. */
  private rejectTypeParameters(what: string): boolean {
    if (!this.isPunct("<")) return false;
    this.unsupported(
      `generic ${what} are not available in this compiler slice`,
      this.current.span,
      "type parameters are not supported yet",
      [
        "small invariant generics are accepted for v0.1 by ADR 0007, but this slice does not implement them",
        "see docs/implementation/slice-1a.md for the supported subset",
      ],
    );
    this.skipDeclaration();
    return true;
  }

  private parseTypeDecl(exported: boolean, start: Span): TypeDecl | null {
    this.advance();
    if (this.current.kind !== "identifier") {
      this.error("expected a type name after 'type'", this.current.span, `found ${this.describe(this.current)}`);
      this.skipDeclaration();
      return null;
    }
    const nameToken = this.advance();
    if (this.rejectTypeParameters("type declarations")) return null;

    const end = this.current.span;
    const fields = this.parseBracedList("the fields of this type", () => this.parseFieldDecl());
    if (!fields) return null;

    return {
      kind: "type",
      exported,
      name: nameToken.text,
      nameSpan: nameToken.span,
      fields,
      span: joinSpans(start, this.tokens[this.position - 1]?.span ?? end),
    };
  }

  /**
   * A variant is a bare name, or a name with a **named** payload:
   * `Paid(transactionId: String)`. That spelling is the one the accepted Q01
   * proposal uses; a positional payload gets a targeted diagnostic instead of a
   * confusing "expected ':'".
   */
  private parseVariantDecl(): VariantDecl | null {
    if (this.current.kind !== "identifier") {
      this.error("expected a variant name", this.current.span, `found ${this.describe(this.current)}`, [
        "a variant is written `Name` or `Name(field: Type)`",
      ]);
      return null;
    }
    const nameToken = this.advance();

    if (!this.isPunct("(")) {
      return { name: nameToken.text, nameSpan: nameToken.span, payload: null, span: nameToken.span };
    }

    this.advance();
    const payload: FieldDecl[] = [];
    while (!this.isPunct(")") && !this.atEnd) {
      // `Paid(String)` is a positional payload; say so rather than complaining
      // about a missing colon.
      if (this.current.kind === "identifier" && (this.isPunct(",", 1) || this.isPunct(")", 1))) {
        this.error(
          "an enum payload needs a name for each value",
          this.current.span,
          "this looks like a type without a field name",
          [
            `write '${nameToken.text}(name: ${this.current.text})' so the value can be referred to by name`,
          ],
        );
        return null;
      }
      const field = this.parseFieldDecl();
      if (!field) return null;
      payload.push(field);
      if (this.isPunct(",")) {
        this.advance();
        continue;
      }
      break;
    }
    const close = this.expectPunct(")", "to close the payload");
    if (!close) return null;
    return {
      name: nameToken.text,
      nameSpan: nameToken.span,
      payload,
      span: joinSpans(nameToken.span, close.span),
    };
  }

  private parseEnumDecl(exported: boolean, start: Span): EnumDecl | null {
    this.advance();
    if (this.current.kind !== "identifier") {
      this.error("expected an enum name after 'enum'", this.current.span, `found ${this.describe(this.current)}`);
      this.skipDeclaration();
      return null;
    }
    const nameToken = this.advance();
    if (this.rejectTypeParameters("enum declarations")) return null;

    const end = this.current.span;
    const variants = this.parseBracedList("the variants of this enum", () => this.parseVariantDecl());
    if (!variants) return null;

    return {
      kind: "enum",
      exported,
      name: nameToken.text,
      nameSpan: nameToken.span,
      variants,
      span: joinSpans(start, this.tokens[this.position - 1]?.span ?? end),
    };
  }

  private parseFunction(exported: boolean, exportSpan: Span | null): FunctionDecl | null {
    const fnToken = this.advance();
    const start = exportSpan ?? fnToken.span;

    if (this.current.kind !== "identifier") {
      this.error("expected a function name after 'fn'", this.current.span, `found ${this.describe(this.current)}`);
      this.skipDeclaration();
      return null;
    }
    const nameToken = this.advance();

    if (this.isPunct("<")) {
      this.unsupported(
        "generic declarations are not available in this compiler slice",
        this.current.span,
        "type parameters are not supported yet",
        [
          "small invariant generics are accepted for v0.1 by ADR 0007, but this slice implements primitives only",
          "see docs/implementation/slice-0.md for the supported subset",
        ],
      );
      this.skipDeclaration();
      return null;
    }

    if (!this.expectPunct("(", "after the function name")) {
      this.skipDeclaration();
      return null;
    }

    const parameters: Parameter[] = [];
    while (!this.isPunct(")") && !this.atEnd) {
      const parameter = this.parseParameter();
      if (!parameter) {
        this.skipDeclaration();
        return null;
      }
      parameters.push(parameter);
      if (this.isPunct(",")) this.advance();
      else break;
    }
    if (!this.expectPunct(")", "to close the parameter list")) {
      this.skipDeclaration();
      return null;
    }

    if (!this.isPunct("->")) {
      this.error("expected '->' and a return type", this.current.span, `found ${this.describe(this.current)}`, [
        "ADR 0007 requires an explicit return type on every function, including private ones",
        "for example: fn greet(name: String) -> String { ... }",
      ]);
      this.skipDeclaration();
      return null;
    }
    this.advance();

    const returnType = this.parseTypeRef();
    if (!returnType) {
      this.skipDeclaration();
      return null;
    }

    const body = this.parseBlock();
    if (!body) return null;

    return {
      kind: "function",
      exported,
      name: nameToken.text,
      nameSpan: nameToken.span,
      parameters,
      returnType,
      body,
      span: joinSpans(start, body.span),
    };
  }

  private parseParameter(): Parameter | null {
    if (this.current.kind !== "identifier") {
      this.error("expected a parameter name", this.current.span, `found ${this.describe(this.current)}`);
      return null;
    }
    const nameToken = this.advance();
    if (!this.expectPunct(":", "after the parameter name")) return null;
    const type = this.parseTypeRef();
    if (!type) return null;
    return { name: nameToken.text, nameSpan: nameToken.span, type };
  }

  private parseTypeRef(): TypeRef | null {
    if (this.current.kind !== "identifier") {
      this.error("expected a type name", this.current.span, `found ${this.describe(this.current)}`);
      return null;
    }
    const token = this.advance();
    if (this.isPunct("<")) {
      this.unsupported(
        "generic type arguments are not available in this compiler slice",
        this.current.span,
        "type arguments are not supported yet",
        ["see docs/implementation/slice-0.md for the supported subset"],
      );
      return null;
    }
    if (this.isPunct("?")) {
      const span = joinSpans(token.span, this.current.span);
      this.advance();
      this.unsupported("nullable types are not available in this compiler slice", span, "'?' is not supported yet", [
        "`T?` is an accepted v0.1 feature (ADR 0007), but using it safely needs `match`, which this slice does not implement",
        "see docs/implementation/slice-0.md for the supported subset",
      ]);
      return null;
    }
    return { name: token.text, span: token.span };
  }

  // -------------------------------------------------------------- statements

  private parseBlock(): Block | null {
    const open = this.expectPunct("{", "to open a block");
    if (!open) return null;

    const statements: Statement[] = [];
    for (;;) {
      this.skipNewlines();
      if (this.isPunct("}") || this.atEnd) break;
      const before = this.position;
      const statement = this.parseStatement();
      if (statement) statements.push(statement);
      if (this.position === before) this.position += 1;
    }

    const close = this.expectPunct("}", "to close a block");
    const span = joinSpans(open.span, close?.span ?? this.current.span);

    // The final expression of a block is its value (ADR 0011). Any earlier
    // expression statement must be a call or an `if`, because ADR 0011 leaves
    // the policy for other discarded values explicitly open.
    let tail: Expression | null = null;
    const last = statements.at(-1);
    if (last && last.kind === "expression") {
      tail = last.expression;
      statements.pop();
    }
    for (const statement of statements) {
      if (statement.kind !== "expression") continue;
      const expression = statement.expression;
      if (
        expression.kind === "call" ||
        expression.kind === "if" ||
        expression.kind === "match" ||
        expression.kind === "error"
      ) {
        continue;
      }
      this.error("this expression is not a statement", expression.span, "its value is computed and then discarded", [
        "only a function call, an `if`, a `match`, or the final expression of a block may stand alone",
      ]);
    }

    return { kind: "block", statements, tail, span };
  }

  private parseStatement(): Statement | null {
    if (this.isKeyword("return")) return this.parseReturn();
    if (this.isKeyword("let")) return this.parseRejectedLet();
    if (this.isKeyword("mut")) return this.parseBind(true);

    // `name =` and `name :` introduce a binding or a rebinding; `name ==` does
    // not. One token of lookahead decides it without consulting any symbol.
    if (this.current.kind === "identifier" && (this.isPunct("=", 1) || this.isPunct(":", 1))) {
      return this.parseBind(false);
    }

    const expression = this.parseExpression();

    // ADR 0009 keeps ordinary fields immutable, so `user.name = ...` is not a
    // form Koda has. Say that plainly instead of "expected the end of the line".
    if (this.isPunct("=") && expression.kind === "member") {
      const equals = this.advance();
      this.skipNewlines();
      const value = this.parseExpression();
      this.diagnostics.add({
        code: Codes.ImmutableAssignment,
        message: `cannot assign to the field '${expression.name}'`,
        span: joinSpans(expression.span, equals.span),
        label: "fields of a value cannot be changed",
        notes: [
          "ordinary records are immutable in Koda: `mut` allows a binding to be rebound, but never changes a field (ADR 0009)",
          "build a new value instead, and rebind a `mut` binding to it",
        ],
      });
      this.endStatement();
      return { kind: "expression", expression: { kind: "error", span: joinSpans(expression.span, value.span) }, span: expression.span };
    }

    this.endStatement();
    return { kind: "expression", expression, span: expression.span };
  }

  private parseRejectedLet(): Statement | null {
    const letToken = this.advance();
    this.diagnostics.add({
      code: Codes.UnexpectedToken,
      message: "Koda does not use 'let' to declare a binding",
      span: letToken.span,
      label: "remove 'let'",
      notes: ["ADR 0011 spells an immutable binding as `name = value`, and a rebindable one as `mut name = value`"],
      suggestions: [
        {
          message: "write the binding without 'let'",
          span: spanFrom(letToken.span.file, letToken.span.start, this.current.span.start),
          replacement: "",
          applicability: "machine-applicable",
        },
      ],
    });
    if (this.current.kind === "identifier") return this.parseBind(false);
    this.recoverToStatementBoundary();
    return null;
  }

  private parseBind(mutable: boolean): Statement | null {
    const mutToken = mutable ? this.advance() : null;
    if (this.current.kind !== "identifier") {
      this.error("expected a name after 'mut'", this.current.span, `found ${this.describe(this.current)}`);
      this.recoverToStatementBoundary();
      return null;
    }
    const nameToken = this.advance();

    let declaredType: TypeRef | null = null;
    if (this.isPunct(":")) {
      this.advance();
      declaredType = this.parseTypeRef();
      if (!declaredType) {
        this.recoverToStatementBoundary();
        return null;
      }
    }

    if (!this.isPunct("=")) {
      this.error("expected '=' and a value", this.current.span, `found ${this.describe(this.current)}`, [
        "every binding is initialised where it is declared",
      ]);
      this.recoverToStatementBoundary();
      return null;
    }
    this.advance();
    this.skipNewlines();

    const value = this.parseExpression();
    this.endStatement();
    return {
      kind: "bind",
      mutable,
      mutSpan: mutToken?.span ?? null,
      name: nameToken.text,
      nameSpan: nameToken.span,
      declaredType,
      value,
      span: joinSpans(mutToken?.span ?? nameToken.span, value.span),
    };
  }

  private parseReturn(): Statement | null {
    const keyword = this.advance();
    // A newline right after bare `return` does not capture the next line.
    if (this.current.kind === "newline" || this.isPunct("}") || this.atEnd) {
      this.endStatement();
      return { kind: "return", value: null, span: keyword.span };
    }
    const value = this.parseExpression();
    this.endStatement();
    return { kind: "return", value, span: joinSpans(keyword.span, value.span) };
  }

  private endStatement(): void {
    if (this.current.kind === "newline") {
      this.advance();
      return;
    }
    if (this.isPunct("}") || this.atEnd) return;
    this.error("expected the end of the line", this.current.span, `found ${this.describe(this.current)}`, [
      "Koda ends a statement at the end of its line; there are no semicolons",
    ]);
    this.recoverToStatementBoundary();
  }

  // ------------------------------------------------------------- expressions

  parseExpression(): Expression {
    return this.parseBinary(0);
  }

  private binaryOperator(): BinaryOperator | null {
    const token = this.current;
    if (token.kind !== "punct") return null;
    return token.text in BINARY_PRECEDENCE ? (token.text as BinaryOperator) : null;
  }

  private parseBinary(minPrecedence: number): Expression {
    let left = this.parseUnary();
    let lastPrecedence = -1;

    for (;;) {
      const operator = this.binaryOperator();
      if (!operator) break;
      const precedence = BINARY_PRECEDENCE[operator];
      if (precedence < minPrecedence) break;

      const chained = NON_ASSOCIATIVE.has(precedence) && precedence === lastPrecedence;
      if (chained) {
        this.error(`'${operator}' cannot be chained`, this.current.span, "this comparison follows another comparison", [
          "comparisons are non-associative in Koda; use parentheses or split the test in two",
        ]);
      }

      const operatorToken = this.advance();
      // A binary operator at the end of a line continues its expression.
      this.skipNewlines();
      const right = this.parseBinary(precedence + 1);
      const span = joinSpans(left.span, right.span);
      // A rejected chain becomes a recovery node so the checker does not then
      // report a dependent type error about the same tokens.
      left = chained
        ? { kind: "error", span }
        : { kind: "binary", operator, operatorSpan: operatorToken.span, left, right, span };
      lastPrecedence = precedence;
    }

    return left;
  }

  private parseUnary(): Expression {
    if (this.isPunct("!") || this.isPunct("-")) {
      const operatorToken = this.advance();
      const operand = this.parseUnary();
      return {
        kind: "unary",
        operator: operatorToken.text as "!" | "-",
        operatorSpan: operatorToken.span,
        operand,
        span: joinSpans(operatorToken.span, operand.span),
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expression = this.parsePrimary();
    for (;;) {
      if (this.isPunct("(")) {
        if (expression.kind !== "name" && expression.kind !== "member") {
          this.error("this is not something that can be called", expression.span, "expected a name here", [
            "Koda v0.1 has no first-class functions; call a declared name, or an enum variant such as `Status.Paid(...)`",
          ]);
          this.skipCallArguments();
          expression = { kind: "error", span: expression.span };
          continue;
        }
        expression = this.parseCall(expression);
        continue;
      }
      if (this.isPunct(".")) {
        this.advance();
        if (this.current.kind !== "identifier") {
          this.error("expected a name after '.'", this.current.span, `found ${this.describe(this.current)}`, [
            "'.' reads a field of a value, or names a variant of an enum",
          ]);
          expression = { kind: "error", span: expression.span };
          continue;
        }
        const nameToken = this.advance();
        expression = {
          kind: "member",
          target: expression,
          name: nameToken.text,
          nameSpan: nameToken.span,
          span: joinSpans(expression.span, nameToken.span),
        };
        continue;
      }
      return expression;
    }
  }

  private skipCallArguments(): void {
    if (!this.isPunct("(")) return;
    let depth = 0;
    do {
      if (this.isPunct("(")) depth += 1;
      else if (this.isPunct(")")) depth -= 1;
      this.position += 1;
    } while (!this.atEnd && depth > 0);
  }

  private parseCall(callee: NameExpression | MemberExpression): Expression {
    this.advance();
    const args: Expression[] = [];
    // An argument list is not a control head, so record literals are allowed
    // again inside it even when the call itself sits in one.
    const suppressed = this.suppressRecordLiteral;
    this.suppressRecordLiteral = false;
    // The lexer suppresses newlines inside (), so a call may span lines.
    while (!this.isPunct(")") && !this.atEnd) {
      // A payload is declared with names but constructed positionally
      // (accepted 2026-09-21, ADR 0011 follow-up). Koda has no labelled
      // argument form, so say that rather than reporting a stray ':' several
      // tokens later.
      if (this.current.kind === "identifier" && this.isPunct(":", 1)) {
        this.error(
          "values are given in order here, not by name",
          this.current.span,
          "a label is not part of a call",
          [
            "a payload is written in declaration order, for example `Status.Paid(\"tx-42\")`",
            "a payload field name documents the value; it is not an argument label (docs/spec/syntax.md)",
          ],
        );
        // Recovery starts *inside* the argument list, so skip to its close.
        let depth = 1;
        while (!this.atEnd && depth > 0) {
          if (this.isPunct("(")) depth += 1;
          else if (this.isPunct(")")) depth -= 1;
          this.position += 1;
        }
        this.suppressRecordLiteral = suppressed;
        return { kind: "error", span: joinSpans(callee.span, this.current.span) };
      }
      args.push(this.parseExpression());
      if (this.isPunct(",")) {
        this.advance();
        continue;
      }
      break;
    }
    const close = this.expectPunct(")", "to close the argument list");
    this.suppressRecordLiteral = suppressed;
    return { kind: "call", callee, args, span: joinSpans(callee.span, close?.span ?? callee.span) };
  }

  /** `name: value` inside a record literal. */
  private parseFieldInit(): FieldInit | null {
    if (this.current.kind !== "identifier") {
      this.error("expected a field name", this.current.span, `found ${this.describe(this.current)}`, [
        "a record entry is written `name: value`",
      ]);
      return null;
    }
    const nameToken = this.advance();
    if (!this.expectPunct(":", "after the field name")) return null;
    this.skipNewlines();
    const value = this.parseExpression();
    return { name: nameToken.text, nameSpan: nameToken.span, value, span: joinSpans(nameToken.span, value.span) };
  }

  private parseRecordLiteral(typeToken: Token): Expression {
    const fields = this.parseBracedList("the fields of this record", () => this.parseFieldInit());
    if (!fields) return { kind: "error", span: typeToken.span };
    return {
      kind: "record",
      typeName: typeToken.text,
      typeSpan: typeToken.span,
      fields,
      span: joinSpans(typeToken.span, this.tokens[this.position - 1]?.span ?? typeToken.span),
    };
  }

  private parsePrimary(): Expression {
    const token = this.current;

    switch (token.kind) {
      case "int":
      case "float":
        this.advance();
        return { kind: "number", category: token.kind, raw: token.text, span: token.span };
      case "string":
        this.advance();
        return { kind: "string", parts: this.parseStringParts(token), span: token.span };
      case "identifier": {
        this.advance();
        // `User {` is a record literal, except in a control head, where ADR
        // 0011 restricts the form so `if flag {` keeps its block.
        if (this.isPunct("{") && !this.suppressRecordLiteral) return this.parseRecordLiteral(token);
        return { kind: "name", name: token.text, span: token.span };
      }
      default:
        break;
    }

    if (this.isKeyword("true") || this.isKeyword("false")) {
      this.advance();
      return { kind: "bool", value: token.text === "true", span: token.span };
    }
    if (this.isKeyword("if")) return this.parseIf();
    if (this.isKeyword("match")) return this.parseMatch();
    if (this.isPunct("(")) {
      const open = this.advance();
      // Parentheses are how ADR 0011 says to disambiguate a record literal in a
      // control head, so they restore the ordinary expression grammar.
      const suppressed = this.suppressRecordLiteral;
      this.suppressRecordLiteral = false;
      const inner = this.parseExpression();
      this.suppressRecordLiteral = suppressed;
      const close = this.expectPunct(")", "to close the group");
      // Kept rather than erased: see ParenExpression in ast.ts.
      return { kind: "paren", expression: inner, span: joinSpans(open.span, close?.span ?? inner.span) };
    }

    const unsupported = token.kind === "keyword" ? UNSUPPORTED_KEYWORDS[token.text] : undefined;
    if (unsupported) {
      this.unsupported(
        `${unsupported.feature} are not available in this compiler slice`,
        token.span,
        `'${token.text}' is not supported yet`,
        [unsupported.note, "see docs/implementation/slice-0.md for the supported subset"],
      );
      this.skipDeclaration();
      return { kind: "error", span: token.span };
    }
    if (this.isKeyword("null")) {
      this.unsupported("null is not available in this compiler slice", token.span, "'null' is not supported yet", [
        "nullable values are an accepted v0.1 feature (ADR 0007), but using them safely needs `match`",
        "see docs/implementation/slice-0.md for the supported subset",
      ]);
      this.advance();
      return { kind: "error", span: token.span };
    }

    this.error("expected an expression", token.span, `found ${this.describe(token)}`);
    if (token.kind !== "newline" && !this.isPunct("}")) this.advance();
    return { kind: "error", span: token.span };
  }

  /** Parses each `{expression}` hole from its captured source span. */
  private parseStringParts(token: Token): StringLiteralPart[] {
    const parts: StringLiteralPart[] = [];
    for (const part of token.parts ?? []) {
      if (part.kind === "text") {
        parts.push({ kind: "text", value: part.value });
        continue;
      }
      const startIndex = this.file.charIndexOf(part.span.start);
      const endIndex = this.file.charIndexOf(part.span.end);
      const innerTokens = new Lexer(this.file, this.diagnostics, startIndex, endIndex).tokenize().tokens;
      const inner = new Parser(this.file, innerTokens, this.diagnostics);
      inner.skipNewlines();
      if (inner.atEnd) {
        this.error("this interpolation is empty", part.span, "expected an expression between the braces");
        parts.push({ kind: "expr", expression: { kind: "error", span: part.span } });
        continue;
      }
      const expression = inner.parseExpression();
      inner.skipNewlines();
      if (!inner.atEnd) {
        this.error(
          "this interpolation contains more than one expression",
          inner.current.span,
          `found ${inner.describe(inner.current)}`,
          ['an interpolation holds a single expression, for example "total: {count}"'],
        );
      }
      parts.push({ kind: "expr", expression });
    }
    return parts;
  }

  /**
   * `PaymentStatus.Paid(id)`, `_`, or a bare name inside a payload list.
   *
   * Nested destructuring is not part of this slice, so a payload entry is a
   * name or `_` and nothing deeper.
   */
  private parsePattern(insidePayload: boolean): Pattern {
    const token = this.current;

    if (token.kind !== "identifier") {
      this.error("expected a pattern", token.span, `found ${this.describe(token)}`, [
        "an arm begins with a variant such as `Status.Paid(id)`, or with `_`",
      ]);
      if (token.kind !== "newline" && !this.isPunct("}")) this.advance();
      return { kind: "pattern-error", span: token.span };
    }

    // A qualified variant: `Enum.Variant`, optionally with a payload list.
    if (this.isPunct(".", 1)) {
      const enumToken = this.advance();
      this.advance();
      if (this.current.kind !== "identifier") {
        this.error("expected a variant name after '.'", this.current.span, `found ${this.describe(this.current)}`);
        return { kind: "pattern-error", span: joinSpans(enumToken.span, this.current.span) };
      }
      const variantToken = this.advance();

      let payload: Pattern[] | null = null;
      let end = variantToken.span;
      if (this.isPunct("(")) {
        this.advance();
        payload = [];
        while (!this.isPunct(")") && !this.atEnd) {
          payload.push(this.parsePattern(true));
          if (this.isPunct(",")) {
            this.advance();
            continue;
          }
          break;
        }
        const close = this.expectPunct(")", "to close the payload pattern");
        end = close?.span ?? variantToken.span;
      }

      return {
        kind: "variant-pattern",
        enumName: enumToken.text,
        enumSpan: enumToken.span,
        variantName: variantToken.text,
        variantSpan: variantToken.span,
        payload,
        span: joinSpans(enumToken.span, end),
      };
    }

    this.advance();
    if (token.text === "_") return { kind: "wildcard", span: token.span };

    if (insidePayload) return { kind: "binding", name: token.text, span: token.span };

    // A bare name standing as a whole arm would be a binding catch-all. ADR
    // 0011 accepts that form, but this slice implements only `_`.
    this.unsupported(
      "a bare name is not available as a whole pattern in this compiler slice",
      token.span,
      "this would bind every remaining value",
      [
        "`_` matches anything without binding it",
        "a qualified variant such as `Status.Paid(id)` matches one case",
        "see docs/implementation/slice-1b.md for the supported subset",
      ],
    );
    return { kind: "pattern-error", span: token.span };
  }

  private parseMatchArm(): MatchArm | null {
    const pattern = this.parsePattern(false);
    if (!this.isPunct("=>")) {
      this.error("expected '=>' after the pattern", this.current.span, `found ${this.describe(this.current)}`, [
        "an arm is written `pattern => result`",
      ]);
      return null;
    }
    this.advance();
    // `=>` requires continuation, so the body may begin on the next line.
    this.skipNewlines();

    // A `{` directly after `=>` opens a block; a record literal needs a type
    // name before its brace, so there is nothing to disambiguate here.
    if (this.isPunct("{")) {
      const body = this.parseBlock();
      if (!body) return null;
      return { pattern, body, span: joinSpans(pattern.span, body.span) };
    }

    const value = this.parseExpression();
    const body: Block = { kind: "block", statements: [], tail: value, span: value.span };
    return { pattern, body, span: joinSpans(pattern.span, value.span) };
  }

  private parseMatch(): Expression {
    const keyword = this.advance();
    // `match value { ... }` stays valid (ADR 0011), so the scrutinee is a
    // control head and a direct record literal is suppressed inside it.
    const suppressed = this.suppressRecordLiteral;
    this.suppressRecordLiteral = true;
    const scrutinee = this.parseExpression();
    this.suppressRecordLiteral = suppressed;

    const arms = this.parseBracedList("the arms of this match", () => this.parseMatchArm());
    if (!arms) return { kind: "error", span: joinSpans(keyword.span, scrutinee.span) };

    return {
      kind: "match",
      scrutinee,
      arms,
      span: joinSpans(keyword.span, this.tokens[this.position - 1]?.span ?? scrutinee.span),
    };
  }

  private parseIf(): Expression {
    const keyword = this.advance();
    // A `{` closes the condition: ADR 0011 restricts direct record literals in
    // control heads precisely so this needs no type information.
    const suppressed = this.suppressRecordLiteral;
    this.suppressRecordLiteral = true;
    const condition = this.parseExpression();
    this.suppressRecordLiteral = suppressed;
    const then = this.parseBlock();
    if (!then) return { kind: "error", span: keyword.span };

    let otherwise: Block | IfExpression | null = null;
    // `else` must be on the same line as the closing brace; a newline would
    // already have ended a complete statement.
    if (this.isKeyword("else")) {
      this.advance();
      if (this.isKeyword("if")) {
        const nested = this.parseIf();
        otherwise = nested.kind === "if" ? nested : null;
      } else {
        otherwise = this.parseBlock();
      }
    }

    return {
      kind: "if",
      condition,
      then,
      otherwise,
      span: joinSpans(keyword.span, otherwise?.span ?? then.span),
    };
  }
}

export function parseModule(file: SourceFile, tokens: readonly Token[], diagnostics: DiagnosticBag): Module {
  return new Parser(file, tokens, diagnostics).parseModule();
}
