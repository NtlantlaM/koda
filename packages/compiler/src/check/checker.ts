/**
 * Resolution and type checking through Slice 2A.
 *
 * Accepted rules enforced here:
 *   - ADR 0007: explicit parameter and return types, inferred locals and call
 *     results, nominal primitive types, no local or parameter shadowing and no
 *     same-scope duplicates, ordinary function recursion, primitive equality.
 *   - ADR 0008: contextual literal typing before a value receives its type,
 *     no implicit conversion between typed Int and Float (including in
 *     comparisons), checked Int faults, and the deferral of Float remainder.
 *   - ADR 0009: bindings are immutable by default; `mut` permits rebinding to
 *     another value of the same type.
 *   - ADR 0011: bare `name = value` declares when no binding of that name is
 *     visible and rebinds otherwise; `let` is not the binding spelling.
 *
 * Expectation propagation follows docs/spec/numbers.md exactly: an annotation,
 * a parameter position or a declared return position supplies an expected
 * numeric type to a literal. A sibling operand never supplies one, which is why
 * `1 + 1.0` is a mismatch while the same expression in a Float-expected
 * position is not.
 */
import { Shapes } from "./obligation-shapes.js";
import { Codes } from "../diagnostics/codes.js";
import type { DiagnosticBag } from "../diagnostics/diagnostic.js";
import { spanFrom, type Span } from "../source/source.js";
import {
  INT_MAX,
  INT_MIN,
  numeralAsFloat,
  numeralAsInt,
  underflowedToZero,
  type NumeralRejection,
} from "../numeric/literals.js";
import type {
  Block,
  EnumDecl,
  Expression,
  FunctionDecl,
  IfExpression,
  MatchExpression,
  Module,
  NumberLiteral,
  Pattern,
  Statement,
  TypeDecl,
  TypeRef,
  TypeParameterDecl,
} from "../syntax/ast.js";
import type { IRNullableArm } from "../ir/ir.js";
import type {
  FunctionSymbol,
  IRBlock,
  IRExpression,
  IRFieldInit,
  IRFunction,
  IRInterpolationPart,
  IRMatchArm,
  IRModule,
  IRStatement,
  LocalSymbol,
} from "../ir/ir.js";
import {
  BoolType,
  ENTRY_MODULE_ID,
  ErrorType,
  PRELUDE_MODULE_ID,
  declarationKey,
  sameDeclarationId,
  substitute,
  type DeclarationId,
  FloatType,
  IntType,
  NeverType,
  PRIMITIVE_TYPES,
  StringType,
  UnitType,
  enumType,
  instantiatedField,
  hasEquality,
  isAssignable,
  isNullable,
  isNumeric,
  nullableType,
  recordType,
  withoutNull,
  typeName,
  unify,
  type EnumDeclaration,
  type FieldSymbol,
  type KType,
  type RecordDeclaration,
  type VariantSymbol,
  type TypeParameterSymbol,
} from "./types.js";

/**
 * The one module specifier this slice resolves. `print` is a compiler and
 * runtime intrinsic; this spelling exposes it provisionally so that a program
 * can produce output. It settles nothing about Koda's module system, which
 * remains Q05. See docs/spec/project-structure.md.
 */
const IO_MODULE = "koda:io";

/**
 * Names the prelude reserves. `Result`, `Ok` and `Err` are prelude names under
 * ADR 0007/0010, and ADR 0008 reserves `Decimal` without giving it v0.1
 * semantics. None of them is usable in this slice, so each gets an explicit
 * unsupported diagnostic rather than an "unknown name".
 */
const RESERVED_PRELUDE_NAMES: ReadonlyMap<string, string> = new Map([
  ["Decimal", "`Decimal` is reserved by ADR 0008 and has no usable v0.1 semantics"],
]);

/**
 * Prelude names that resolve to real behaviour but stay closed to user
 * declarations and bindings, so `Result`, `Ok` and `Err` always mean one thing.
 */
const PRELUDE_NAMES: ReadonlySet<string> = new Set(["Result", "Ok", "Err", "List"]);

const RESULT_TYPE_NAME = "Result";
const LIST_TYPE_NAME = "List";
const RESULT_OK = "Ok";
const RESULT_ERR = "Err";

const INTERPOLATABLE = new Set(["String", "Int", "Float"]);

interface Scope {
  readonly bindings: Map<string, LocalSymbol>;
  /**
   * Active null refinements, keyed by symbol id.
   *
   * Refinement is lexical (ADR 0007 follow-up): a nested scope inherits what
   * the enclosing ones established, and popping a scope at an ordinary join
   * restores the declared nullable type.
   */
  readonly refinements: Map<number, KType>;
}

/** What a condition proves about its operands in each branch. */
interface Refinement {
  readonly symbol: LocalSymbol;
  readonly type: KType;
}

interface CheckedCondition {
  readonly ir: IRExpression;
  readonly whenTrue: readonly Refinement[];
  readonly whenFalse: readonly Refinement[];
}

interface BlockResult {
  readonly block: IRBlock;
  /** True when every path through the block returns from the function. */
  readonly alwaysReturns: boolean;
}

export class Checker {
  private readonly diagnostics: DiagnosticBag;
  private readonly path: string;
  private readonly functions = new Map<string, FunctionSymbol>();
  private scopes: Scope[] = [];
  private returnType: KType = UnitType;
  /**
   * Type parameters of the function whose signature or body is being checked
   * (Slice 4A). Empty outside a generic function. It mirrors `returnType`:
   * ambient per-function state, so `T` resolves in annotations and in written
   * construction arguments without threading a parameter through every call.
   */
  private typeParameters: readonly TypeParameterSymbol[] = [];
  private nextSymbolId = 0;
  private readonly records = new Map<string, RecordDeclaration>();
  private readonly enums = new Map<string, EnumDeclaration>();
  /**
   * Every module-level name, whatever it declares.
   *
   * ADR 0011 leaves the type/value namespace rules unspecified, so this slice
   * uses one namespace and rejects a collision. That is the conservative
   * direction: a separate-namespace rule can be adopted later without
   * invalidating any program that compiles today.
   */
  private readonly moduleNames = new Map<string, { what: string; span: Span }>();
  private resultDeclaration: EnumDeclaration | null = null;
  private listDeclaration: RecordDeclaration | null = null;
  /**
   * Per-module local declaration counter (Q05-A).
   *
   * Records, enums and functions all draw from it, so any declaration that may
   * own generic parameters has an identity. The prelude allocates separately,
   * under its own module id.
   */
  private nextLocalId = 0;

  /** The next `{ module, local }` for a declaration of the module being checked. */
  private allocateDeclarationId(): DeclarationId {
    return { module: ENTRY_MODULE_ID, local: this.nextLocalId++ };
  }

  constructor(path: string, diagnostics: DiagnosticBag) {
    this.path = path;
    this.diagnostics = diagnostics;
  }

  // ------------------------------------------------------------------ module

  check(module: Module): IRModule {
    this.declarePreludeResult();
    this.declarePreludeList();
    this.checkImports(module);

    // Declarations are mutually visible regardless of order, so names are
    // claimed first, then member types resolved, then function signatures, and
    // only then bodies.
    this.declareDataShells(module);
    this.resolveDataMembers(module);
    this.rejectRecursiveData();
    this.declareFunctions(module);

    const functions: IRFunction[] = [];
    for (const declaration of module.declarations) {
      if (declaration.kind !== "function") continue;
      const symbol = this.functions.get(declaration.name);
      if (!symbol || symbol.origin.kind !== "declared") continue;
      functions.push(this.checkFunction(declaration, symbol));
    }

    return {
      path: this.path,
      functions,
      entry: this.resolveEntry(module),
      resultDeclarationId: this.resultDeclaration?.id ?? null,
      listDeclarationId: this.listDeclaration?.id ?? null,
    };
  }

  /**
   * Builds the prelude `Result<T, E>` as an ordinary generic enum.
   *
   * ADR 0010's follow-up fixes the payload names as `value` and `error`. Using
   * the same EnumDeclaration shape a user declaration produces means every
   * later stage - application, substitution, patterns, exhaustiveness, IR and
   * lowering - treats Result as the ordinary enum it is, with no special case.
   */
  private declarePreludeResult(): void {
    // Canonical prelude identity (Q05-A): `Result` is the same nominal
    // declaration in every module of a compilation, because it is allocated
    // under the prelude's own module id rather than the user module's counter.
    //
    // SEAM: the prelude is not yet a compiled module - it has canonical
    // identity and nothing else. Making it a real module needs the multi-source
    // machinery Q05-B owns. See docs/implementation/q05a-identity-foundation.md.
    const id: DeclarationId = { module: PRELUDE_MODULE_ID, local: 0 };
    const span = spanFrom(this.path, 0, 0);
    const typeParameters: TypeParameterSymbol[] = [
      { ownerId: id, index: 0, name: "T", declarationSpan: span },
      { ownerId: id, index: 1, name: "E", declarationSpan: span },
    ];
    const parameterType = (index: number): KType => ({ kind: "TypeParameter", parameter: typeParameters[index]! });

    const ok: VariantSymbol = {
      name: RESULT_OK,
      declarationSpan: span,
      index: 0,
      payload: [{ name: "value", type: parameterType(0), declarationSpan: span, index: 0 }],
    };
    const err: VariantSymbol = {
      name: RESULT_ERR,
      declarationSpan: span,
      index: 1,
      payload: [{ name: "error", type: parameterType(1), declarationSpan: span, index: 0 }],
    };

    const declaration: EnumDeclaration = {
      id,
      name: RESULT_TYPE_NAME,
      nameSpan: span,
      exported: true,
      typeParameters,
      variants: [ok, err],
      variantsByName: new Map([
        [RESULT_OK, ok],
        [RESULT_ERR, err],
      ]),
    };

    this.resultDeclaration = declaration;
    this.enums.set(RESULT_TYPE_NAME, declaration);
  }

  /**
   * Builds the prelude `List<T>` (Slice 5).
   *
   * It is an ordinary generic record-shaped nominal declaration with no fields,
   * so arity, substitution, `sameType`, `typeName` and invariance all come from
   * the existing machinery. Its elements are not a declared member, which is
   * why the obligation shape recognises it by declaration identity instead.
   */
  private declarePreludeList(): void {
    const id: DeclarationId = { module: PRELUDE_MODULE_ID, local: 1 };
    const span = spanFrom(this.path, 0, 0);
    const declaration: RecordDeclaration = {
      id,
      name: LIST_TYPE_NAME,
      nameSpan: span,
      exported: true,
      typeParameters: [{ ownerId: id, index: 0, name: "T", declarationSpan: span }],
      fields: [],
      fieldsByName: new Map(),
    };
    this.listDeclaration = declaration;
    this.records.set(LIST_TYPE_NAME, declaration);
  }

  /** True for the prelude List, whatever element type it carries. */
  private isList(type: KType): type is Extract<KType, { kind: "Record" }> {
    return type.kind === "Record" && this.listDeclaration !== null
      && sameDeclarationId(type.declaration.id, this.listDeclaration.id);
  }

  /** `List<T>` for an element type. */
  private listOf(element: KType): KType {
    return this.listDeclaration ? recordType(this.listDeclaration, [element]) : ErrorType;
  }

  /** True for the prelude Result, whatever arguments it carries. */
  private isResult(type: KType): type is Extract<KType, { kind: "Enum" }> {
    return type.kind === "Enum" && this.resultDeclaration !== null
      && sameDeclarationId(type.declaration.id, this.resultDeclaration.id);
  }

  /**
   * Claims a module-level name. Returns false when the name is unusable, in
   * which case a diagnostic has already been reported.
   */
  private claimModuleName(name: string, span: Span, what: string): boolean {
    if (PRIMITIVE_TYPES.has(name) || RESERVED_PRELUDE_NAMES.has(name) || PRELUDE_NAMES.has(name)) {
      this.diagnostics.add({
        code: Codes.DuplicateName,
        message: `'${name}' is a prelude name and cannot be declared`,
        span,
        label: "this name is reserved",
        notes: [`choose another name for this ${what}`],
      });
      return false;
    }
    const existing = this.moduleNames.get(name);
    if (existing) {
      this.duplicate(name, span, existing.span);
      return false;
    }
    this.moduleNames.set(name, { what, span });
    return true;
  }

  private declareTypeParameters(parameters: readonly TypeParameterDecl[], ownerId: DeclarationId): TypeParameterSymbol[] {
    const seen = new Map<string, Span>();
    return parameters.map((parameter, index) => {
      const previous = seen.get(parameter.name);
      if (previous) this.duplicate(parameter.name, parameter.span, previous);
      // Closed names stay closed in every position, including a type parameter
      // (Slice 4A aligned functions with the rule data declarations follow).
      if (
        PRIMITIVE_TYPES.has(parameter.name) ||
        PRELUDE_NAMES.has(parameter.name) ||
        RESERVED_PRELUDE_NAMES.has(parameter.name)
      ) {
        this.diagnostics.add({
          code: Codes.DuplicateName,
          message: "'" + parameter.name + "' is a reserved type name",
          span: parameter.span,
          label: "choose another type parameter name",
        });
      }
      seen.set(parameter.name, parameter.span);
      return { ownerId, index, name: parameter.name, declarationSpan: parameter.span };
    });
  }

  /** Pass one: every `type` and `enum` exists before any member type is read. */
  private declareDataShells(module: Module): void {
    for (const declaration of module.declarations) {
      if (declaration.kind === "type") {
        if (!this.claimModuleName(declaration.name, declaration.nameSpan, "type")) continue;
        const recordId = this.allocateDeclarationId();
        this.records.set(declaration.name, {
          typeParameters: this.declareTypeParameters(declaration.typeParameters, recordId),
          id: recordId,
          name: declaration.name,
          nameSpan: declaration.nameSpan,
          exported: declaration.exported,
          fields: [],
          fieldsByName: new Map(),
        });
        continue;
      }
      if (declaration.kind === "enum") {
        if (!this.claimModuleName(declaration.name, declaration.nameSpan, "enum")) continue;
        const enumId = this.allocateDeclarationId();
        this.enums.set(declaration.name, {
          typeParameters: this.declareTypeParameters(declaration.typeParameters, enumId),
          id: enumId,
          name: declaration.name,
          nameSpan: declaration.nameSpan,
          exported: declaration.exported,
          variants: [],
          variantsByName: new Map(),
        });
      }
    }
  }

  /** Pass two: field and payload types, now that every type name resolves. */
  private resolveDataMembers(module: Module): void {
    for (const declaration of module.declarations) {
      if (declaration.kind === "type") this.resolveRecordFields(declaration);
      else if (declaration.kind === "enum") this.resolveEnumVariants(declaration);
    }
  }

  private resolveRecordFields(declaration: TypeDecl): void {
    const record = this.records.get(declaration.name);
    // A duplicate declaration kept the first shell; do not fill it twice.
    if (!record || record.nameSpan !== declaration.nameSpan) return;

    const seen = new Map<string, Span>();
    for (const field of declaration.fields) {
      const previous = seen.get(field.name);
      if (previous) {
        this.duplicateMember(field.name, "field", field.nameSpan, previous);
        continue;
      }
      seen.set(field.name, field.nameSpan);
      const symbol: FieldSymbol = {
        name: field.name,
        type: this.resolveType(field.type, record.typeParameters),
        declarationSpan: field.nameSpan,
        index: record.fields.length,
      };
      record.fields.push(symbol);
      record.fieldsByName.set(symbol.name, symbol);
    }
  }

  private resolveEnumVariants(declaration: EnumDecl): void {
    const enumeration = this.enums.get(declaration.name);
    if (!enumeration || enumeration.nameSpan !== declaration.nameSpan) return;

    const seen = new Map<string, Span>();
    for (const variant of declaration.variants) {
      const previous = seen.get(variant.name);
      if (previous) {
        this.duplicateMember(variant.name, "variant", variant.nameSpan, previous);
        continue;
      }
      seen.set(variant.name, variant.nameSpan);

      let payload: FieldSymbol[] | null = null;
      if (variant.payload) {
        const components: FieldSymbol[] = [];
        const seenComponents = new Map<string, Span>();
        for (const component of variant.payload) {
          const earlier = seenComponents.get(component.name);
          if (earlier) {
            this.duplicateMember(component.name, "payload value", component.nameSpan, earlier);
            continue;
          }
          seenComponents.set(component.name, component.nameSpan);
          components.push({
            name: component.name,
            type: this.resolveType(component.type, enumeration.typeParameters),
            declarationSpan: component.nameSpan,
            index: components.length,
          });
        }
        payload = components;
      }

      const symbol: VariantSymbol = {
        name: variant.name,
        declarationSpan: variant.nameSpan,
        index: enumeration.variants.length,
        payload,
      };
      enumeration.variants.push(symbol);
      enumeration.variantsByName.set(symbol.name, symbol);
    }
  }

  /**
   * ADR 0007 defers recursive user-defined data types, so a cycle through
   * fields or payloads is rejected rather than quietly accepted.
   */
  /**
   * The declarations that can carry responsibility (Slice 6C).
   *
   * A declaration bears when any stored member reaches a `Result`, an
   * unconstrained type parameter (which is assumed to bear under Slice 4A), or
   * another bearing declaration. This is a **least** fixed point: iteration
   * starts at "nothing bears" and runs to stability, which is what makes a
   * declaration whose only self-reference is its own cycle resolve to false
   * rather than looping.
   *
   * ADR 0010 uses this to decide which recursive cycles can be admitted: a
   * recursive structure holds unboundedly many values, so one whose elements
   * can each carry a Result holds unboundedly many responsibilities, and that
   * cannot be tracked structurally.
   */
  private bearingDeclarations(): Set<string> {
    const bearing = new Set<string>();

    const reaches = (type: KType): boolean => {
      if (type.kind === "Nullable") return reaches(type.inner);
      if (type.kind === "TypeParameter") return true;
      if (type.kind === "Record" || type.kind === "Enum") {
        if (this.isResult(type)) return true;
        if (bearing.has(declarationKey(type.declaration.id))) return true;
        return type.arguments.some(reaches);
      }
      return false;
    };

    const members = (key: string): KType[] => {
      const record = [...this.records.values()].find((item) => declarationKey(item.id) === key);
      if (record) return record.fields.map((field) => field.type);
      const enumeration = [...this.enums.values()].find((item) => declarationKey(item.id) === key);
      if (!enumeration) return [];
      return enumeration.variants.flatMap((variant) => (variant.payload ?? []).map((field) => field.type));
    };

    const keys = [
      ...[...this.records.values()].map((item) => declarationKey(item.id)),
      ...[...this.enums.values()].map((item) => declarationKey(item.id)),
    ];

    // Iterate to stability. Each round can only add, and there are finitely
    // many declarations, so this terminates.
    for (let changed = true; changed; ) {
      changed = false;
      for (const key of keys) {
        if (bearing.has(key)) continue;
        if (members(key).some(reaches)) {
          bearing.add(key);
          changed = true;
        }
      }
    }
    return bearing;
  }

  private rejectRecursiveData(): void {
    interface Node {
      readonly id: DeclarationId;
      readonly name: string;
      readonly nameSpan: Span;
      readonly edges: { readonly to: string; readonly via: string; readonly breakable: boolean }[];
    }
    // Q05-A: keyed by `declarationKey`, not a bare number, so two modules'
    // local id 1 can never share a node.
    const nodes = new Map<string, Node>();

    // Walk stored type expressions, including nullable wrappers and arguments.
    // Edges are declaration identities: changing arguments cannot hide a cycle.
    //
    // Slice 6C: an edge is `breakable` when reaching it passes through a
    // nullable or a list element, because `null` and `[]` are base cases. A
    // cycle with no breakable edge describes a value that cannot be built.
    const targets = (type: KType, breakable: boolean): { to: string; breakable: boolean }[] => {
      if (type.kind === "Nullable") return targets(type.inner, true);
      if (type.kind === "Record" || type.kind === "Enum") {
        const through = this.isList(type) || breakable;
        return [
          { to: declarationKey(type.declaration.id), breakable },
          ...type.arguments.flatMap((argument) => targets(argument, through)),
        ];
      }
      return [];
    };

    for (const record of this.records.values()) {
      const edges: Node["edges"] = [];
      for (const field of record.fields) {
        for (const edge of targets(field.type, false)) edges.push({ ...edge, via: field.name });
      }
      nodes.set(declarationKey(record.id), { id: record.id, name: record.name, nameSpan: record.nameSpan, edges });
    }
    for (const enumeration of this.enums.values()) {
      const edges: Node["edges"] = [];
      // A variant that carries nothing is a base case, so a cycle through this
      // enum's payloads can stop: `enum Tree { Leaf, Node(child: Tree) }` is
      // built as `Tree.Leaf`. Without one, every value would need another.
      const hasBaseVariant = enumeration.variants.some((variant) => (variant.payload ?? []).length === 0);
      for (const variant of enumeration.variants) {
        for (const component of variant.payload ?? []) {
          for (const edge of targets(component.type, hasBaseVariant)) {
            edges.push({ ...edge, via: `${variant.name}.${component.name}` });
          }
        }
      }
      nodes.set(declarationKey(enumeration.id), { id: enumeration.id, name: enumeration.name, nameSpan: enumeration.nameSpan, edges });
    }

    const bearing = this.bearingDeclarations();

    const state = new Map<string, "visiting" | "done">();
    const reported = new Set<string>();
    const stack: { id: string; via: string; breakable: boolean }[] = [];

    const visit = (id: string): void => {
      const node = nodes.get(id);
      if (!node || state.get(id) === "done") return;

      if (state.get(id) === "visiting") {
        const start = stack.findIndex((frame) => frame.id === id);
        const cycle = stack.slice(start < 0 ? 0 : start);
        // Slice 6C: a cycle is admitted when nothing on it carries
        // responsibility and it can actually be built. Otherwise say which.
        const carries = cycle.some((frame) => bearing.has(frame.id)) || bearing.has(id);
        const canStop = cycle.some((frame) => frame.breakable);
        if (!carries && canStop) return;

        if (cycle.every((frame) => !reported.has(frame.id))) {
          for (const frame of cycle) reported.add(frame.id);
          const names = [...cycle.map((frame) => nodes.get(frame.id)?.name ?? "?"), node.name];
          const hops = cycle.map((frame) => frame.via);
          const chain = `the chain is ${names.join(" -> ")}, through ${hops.join(", ")}`;
          this.diagnostics.add(carries
            ? {
              code: Codes.Unsupported,
              message: `'${node.name}' can hold outcomes at any depth`,
              span: node.nameSpan,
              label: "this type contains itself, and each level can carry a Result",
              notes: [
                chain,
                "Koda tracks responsibility structurally, and cannot account for unboundedly many outcomes",
                "an unconstrained type parameter counts, because it might be a Result",
                "a recursive type is allowed when nothing on the cycle can carry one",
              ],
            }
            : {
              code: Codes.Unsupported,
              message: `'${node.name}' cannot be built`,
              span: node.nameSpan,
              label: `every path back to '${node.name}' stores one directly`,
              notes: [
                chain,
                "building one would need another first, with nothing to stop it",
                "make a step optional with '?', or hold the children in a List",
              ],
            });
        }
        return;
      }

      state.set(id, "visiting");
      for (const edge of node.edges) {
        stack.push({ id, via: edge.via, breakable: edge.breakable });
        visit(edge.to);
        stack.pop();
      }
      state.set(id, "done");
    };

    // Declaration order, as before: by module then local, never lexicographic.
    const ordered = [...nodes.entries()].sort(([, a], [, b]) =>
      a.id.module - b.id.module || a.id.local - b.id.local,
    );
    for (const [id] of ordered) visit(id);
  }

  private checkImports(module: Module): void {
    for (const declaration of module.imports) {
      if (declaration.moduleSpecifier !== IO_MODULE) {
        this.diagnostics.add({
          code: Codes.ModuleResolution,
          message: `cannot resolve the module "${declaration.moduleSpecifier}"`,
          span: declaration.moduleSpan,
          label: "this module is not available",
          notes: [
            `this compiler slice resolves only "${IO_MODULE}", which is a provisional intrinsic rather than a module`,
            "relative imports and npm dependencies wait on Q05 and Q06, which are still unresolved",
          ],
        });
        continue;
      }
      for (const imported of declaration.names) {
        if (imported.name !== "print") {
          this.diagnostics.add({
            code: Codes.UnresolvedName,
            message: `"${IO_MODULE}" does not export '${imported.name}'`,
            span: imported.span,
            label: "this name is not exported",
            notes: [`this compiler slice provides only 'print' from "${IO_MODULE}"`],
          });
          continue;
        }
        this.declareBuiltinPrint(imported.span);
      }
    }
  }

  private declareBuiltinPrint(span: Span): void {
    const existing = this.functions.get("print");
    if (existing) {
      this.duplicate("print", span, existing.declarationSpan);
      return;
    }
    const parameter: LocalSymbol = {
      id: this.nextSymbolId++,
      name: "value",
      type: StringType,
      mutable: false,
      declarationSpan: span,
    };
    this.functions.set("print", {
      id: this.nextSymbolId++,
      declarationId: this.allocateDeclarationId(),
      typeParameters: [],
      name: "print",
      parameters: [parameter],
      returnType: UnitType,
      origin: { kind: "builtin", runtimeName: "print" },
      declarationSpan: span,
    });
  }

  private declareFunctions(module: Module): void {
    for (const declaration of module.declarations) {
      if (declaration.kind !== "function") continue;
      // `print` is claimed by the import rather than by a declaration.
      const existing = this.functions.get(declaration.name);
      if (existing) {
        this.duplicate(declaration.name, declaration.nameSpan, existing.declarationSpan);
        continue;
      }
      if (!this.claimModuleName(declaration.name, declaration.nameSpan, "function")) continue;

      const declarationId = this.allocateDeclarationId();
      const typeParameters = this.declareTypeParameters(declaration.typeParameters, declarationId);
      this.typeParameters = typeParameters;

      const parameters: LocalSymbol[] = [];
      const seen = new Map<string, Span>();
      for (const parameter of declaration.parameters) {
        const previous = seen.get(parameter.name);
        if (previous) {
          this.duplicate(parameter.name, parameter.nameSpan, previous);
          continue;
        }
        seen.set(parameter.name, parameter.nameSpan);
        parameters.push({
          id: this.nextSymbolId++,
          name: parameter.name,
          type: this.resolveType(parameter.type, typeParameters),
          mutable: false,
          declarationSpan: parameter.nameSpan,
        });
      }

      this.functions.set(declaration.name, {
        id: this.nextSymbolId++,
        // Q05-A identity, now spent: it owns this function's type parameters.
        declarationId,
        typeParameters,
        name: declaration.name,
        parameters,
        returnType: this.resolveType(declaration.returnType, typeParameters),
        origin: { kind: "declared", exported: declaration.exported },
        declarationSpan: declaration.nameSpan,
      });
      this.typeParameters = [];
    }
  }

  /**
   * docs/spec/language.md fixes the entry contract: the entry module exports
   * `main` with no parameters and a `Unit` return.
   */
  private resolveEntry(module: Module): FunctionSymbol | null {
    const declaration = module.declarations.find(
      (item): item is FunctionDecl => item.kind === "function" && item.name === "main",
    );
    const symbol = this.functions.get("main");
    if (!declaration || !symbol || symbol.origin.kind !== "declared") return null;

    let valid = true;
    if (!symbol.origin.exported) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: "'main' must be exported to run",
        span: declaration.nameSpan,
        label: "this entry function is private",
        notes: ["write `export fn main() -> Unit { ... }`"],
      });
      valid = false;
    }
    if (symbol.parameters.length > 0) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: "'main' takes no parameters",
        span: declaration.parameters[0]?.nameSpan ?? declaration.nameSpan,
        label: "remove this parameter",
        notes: ["the entry function is called by the generated launcher with no arguments"],
      });
      valid = false;
    }
    if (symbol.returnType.kind !== "Unit") {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: "'main' must return Unit",
        span: declaration.returnType.span,
        label: `found ${typeName(symbol.returnType)}`,
        notes: ["the entry function returns Unit"],
      });
      valid = false;
    }
    return valid ? symbol : null;
  }

  private checkFunction(declaration: FunctionDecl, symbol: FunctionSymbol): IRFunction {
    this.scopes = [{ bindings: new Map(), refinements: new Map() }];
    this.returnType = symbol.returnType;
    // Slice 4A: `T` resolves in body annotations and construction arguments.
    this.typeParameters = symbol.typeParameters;
    for (const parameter of symbol.parameters) {
      this.scopes[0]!.bindings.set(parameter.name, parameter);
    }

    const result = this.checkBlock(declaration.body, symbol.returnType);
    const bodyType = result.block.type;
    if (!isAssignable(bodyType, symbol.returnType)) {
      const span = declaration.body.tail?.span ?? declaration.body.span;
      if (symbol.returnType.kind === "Unit" && this.hasResponsibility(bodyType)) {
        this.reportDiscardedResult(span, bodyType);
      } else if (bodyType.kind === "Unit" && symbol.returnType.kind !== "Unit") {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `'${symbol.name}' must produce a ${typeName(symbol.returnType)} value`,
          span,
          label: "this block ends without a value",
          secondary: [{ span: declaration.returnType.span, message: "declared return type" }],
          notes: ["end the block with the value it produces, or use `return`"],
        });
      } else if (
        result.block.tail &&
        bodyType.kind === "Nullable" &&
        isAssignable(withoutNull(bodyType), symbol.returnType)
      ) {
        this.unsafeNullable(result.block.tail, typeName(symbol.returnType));
      } else {
        this.mismatch(bodyType, symbol.returnType, span, "this is the value the block produces");
      }
    }

    this.scopes = [];
    this.typeParameters = [];
    return { symbol, body: result.block };
  }

  private resolveType(reference: TypeRef, parameters: readonly TypeParameterSymbol[] = []): KType {
    const inner = this.resolveTypeName(reference, parameters);
    if (!reference.nullable) return inner;
    if (inner.kind === "Error") return inner;
    // Q08 has not settled how Unit and absence stay distinguishable.
    if (inner.kind === "Unit") {
      this.diagnostics.add({
        code: Codes.Unsupported,
        message: "'Unit?' is not available in this compiler slice",
        span: reference.span,
        label: "a nullable Unit is not supported yet",
        notes: [
          "Unit and absence must remain distinguishable, which is an unresolved Q08 question",
          "see docs/implementation/slice-1c.md for the supported subset",
        ],
      });
      return ErrorType;
    }
    return nullableType(inner);
  }

  private resolveTypeName(reference: TypeRef, parameters: readonly TypeParameterSymbol[]): KType {
    const args = reference.arguments?.map((argument) => this.resolveType(argument, parameters)) ?? [];
    const parameter = parameters.find((item) => item.name === reference.name);
    const primitive = PRIMITIVE_TYPES.get(reference.name);
    const record = this.records.get(reference.name);
    const enumeration = this.enums.get(reference.name);
    const declaration = parameter ? undefined : record ?? enumeration;
    if (parameter || primitive || declaration) {
      const arity = declaration?.typeParameters.length ?? 0;
      if (args.length !== arity || (arity === 0 && reference.arguments !== null)) {
        this.diagnostics.add({
          code: Codes.TypeArgumentCount,
          message: arity === 0
            ? `'${reference.name}' does not accept type arguments`
            : `'${reference.name}' expects ${arity} type argument${arity === 1 ? "" : "s"}, but received ${args.length}`,
          span: reference.span,
          label: arity === 0 ? "this type does not accept type arguments" : "supply every type argument explicitly",
          secondary: declaration ? [{ span: declaration.nameSpan, message: "declared here" }] : [],
          notes: ["type arguments cannot be omitted, inferred, defaulted or partially applied"],
        });
        return ErrorType;
      }
      if (parameter) return { kind: "TypeParameter", parameter };
      if (primitive) return primitive;
      if (record) return recordType(record, args);
      if (enumeration) return enumType(enumeration, args);
    }

    const reserved = RESERVED_PRELUDE_NAMES.get(reference.name);
    if (reserved) {
      this.diagnostics.add({
        code: Codes.Unsupported,
        message: `the type '${reference.name}' is not available in this compiler slice`,
        span: reference.span,
        label: "this type is not supported yet",
        notes: [reserved, "see docs/implementation/slice-1a.md for the supported subset"],
      });
      return ErrorType;
    }

    if (this.functions.has(reference.name)) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${reference.name}' is a function, not a type`,
        span: reference.span,
        label: "a type was expected here",
      });
      return ErrorType;
    }

    const suggestion = this.nearestTypeName(reference.name);
    this.diagnostics.add({
      code: Codes.UnresolvedName,
      message: `unknown type '${reference.name}'`,
      span: reference.span,
      label: "no type with this name is in scope",
      notes: [
        suggestion
          ? `a type in scope is spelled '${suggestion}'`
          : "declare it with `type` or `enum`, or use Bool, String, Int, Float or Unit",
      ],
      suggestions: suggestion
        ? [
            {
              message: `use '${suggestion}'`,
              span: reference.span,
              replacement: suggestion,
              applicability: "needs-review",
            },
          ]
        : [],
    });
    return ErrorType;
  }

  /** Keep the existing Unit? runtime boundary when substitution exposes it. */
  private supportedMemberType(type: KType, span: Span): KType {
    const containsNullableUnit = (value: KType): boolean => {
      if (value.kind === "Nullable") return value.inner.kind === "Unit" || containsNullableUnit(value.inner);
      if (value.kind === "Record" || value.kind === "Enum") return value.arguments.some(containsNullableUnit);
      return false;
    };
    if (!containsNullableUnit(type)) return type;
    this.diagnostics.add({
      code: Codes.Unsupported,
      message: "this member's substituted type contains unsupported 'Unit?'",
      span,
      label: "nullable Unit remains outside this compiler slice",
      notes: ["Slice 1C's Unit/absence representation boundary remains unresolved under Q08"],
    });
    return ErrorType;
  }

  private nearestTypeName(name: string): string | null {
    const candidates = [...PRIMITIVE_TYPES.keys(), ...this.records.keys(), ...this.enums.keys()];
    return nearest(name, candidates);
  }

  // -------------------------------------------------------------- statements

  private checkBlock(block: Block, expected: KType | null): BlockResult {
    this.pushScope();
    const statements: IRStatement[] = [];
    let alwaysReturns = false;

    for (const statement of block.statements) {
      const checked = this.checkStatement(statement);
      if (checked) {
        statements.push(checked.statement);
        alwaysReturns = alwaysReturns || checked.alwaysReturns;
      }
    }

    let tail: IRExpression | null = null;
    let type: KType;
    if (block.tail) {
      tail = this.checkExpression(block.tail, expected);
      type = tail.type;
      if (type.kind === "Never") alwaysReturns = true;
    } else {
      type = alwaysReturns ? NeverType : UnitType;
    }

    this.scopes.pop();
    return { block: { statements, tail, type, span: block.span }, alwaysReturns };
  }

  private checkStatement(statement: Statement): { statement: IRStatement; alwaysReturns: boolean } | null {
    switch (statement.kind) {
      case "for":
        return this.checkFor(statement);
      case "bind":
        return this.checkBind(statement);
      case "return": {
        const span = statement.span;
        if (!statement.value) {
          if (this.returnType.kind !== "Unit" && this.returnType.kind !== "Error") {
            this.diagnostics.add({
              code: Codes.TypeMismatch,
              message: `this function must return a ${typeName(this.returnType)} value`,
              span,
              label: "'return' with no value returns Unit",
              notes: ["write `return` followed by the value, on the same line"],
            });
          }
          return { statement: { kind: "return", value: null, span }, alwaysReturns: true };
        }
        const value = this.checkExpression(statement.value, this.returnType);
        this.expect(value, this.returnType, "this is the value being returned");
        return { statement: { kind: "return", value, span }, alwaysReturns: true };
      }
      case "expression": {
        // `if` and `match` used as statements produce no value, so Unit is
        // expected. ADR 0011 keeps one `match`, not a statement-only variant.
        const kind = statement.expression.kind;
        const isControl = kind === "if" || kind === "match";
        const value = this.checkExpression(statement.expression, isControl ? UnitType : null);
        if (isControl) {
          this.expect(value, UnitType, `${kind === "if" ? "an `if`" : "a `match`"} statement cannot produce a value`);
        }
        return {
          statement: { kind: "eval", value, span: statement.span },
          alwaysReturns: value.type.kind === "Never",
        };
      }
    }
  }

  /**
   * `[a, b, c]` (Slice 5).
   *
   * An expected `List<T>` is authoritative and supplies `T` to every element.
   * Otherwise the first element's type is the element type and every later one
   * is checked against exactly that. There is no join and no unification, so a
   * sibling never widens another.
   */
  private checkList(
    expression: Extract<Expression, { kind: "list" }>,
    expected: KType | null,
  ): IRExpression {
    const span = expression.span;
    // Peel exactly one outer nullable, the general contextual rule.
    const target = expected && expected.kind === "Nullable" ? expected.inner : expected;
    const expectedElement = target && this.isList(target) ? target.arguments[0] ?? null : null;

    if (expression.elements.length === 0) {
      if (!expectedElement) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: "this empty list has no element type",
          span,
          label: "nothing here says what it would hold",
          notes: [
            "give it a context that names the element type, such as an annotated binding `values: List<Int> = []`, a return type, or a parameter",
            "Koda never invents the element type of an empty list",
          ],
        });
        return this.errorValue(span);
      }
      const elementType = this.supportedMemberType(expectedElement, span);
      if (elementType.kind === "Error") return this.errorValue(span);
      return { kind: "list", elements: [], type: this.listOf(elementType), span };
    }

    const elements: IRExpression[] = [];
    let elementType: KType | null = expectedElement
      ? this.supportedMemberType(expectedElement, span)
      : null;
    if (elementType !== null && elementType.kind === "Error") return this.errorValue(span);
    let originSpan: Span | null = null;
    let valid = true;

    for (const element of expression.elements) {
      const value = this.checkExpression(element, elementType);
      if (value.type.kind === "Error") {
        valid = false;
        continue;
      }
      if (elementType === null) {
        // The first element decides, and only because nothing else did.
        const first = this.supportedMemberType(value.type, element.span);
        if (first.kind === "Error") {
          valid = false;
          continue;
        }
        elementType = first;
        originSpan = element.span;
        elements.push(value);
        continue;
      }
      if (!isAssignable(value.type, elementType)) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `this list holds ${typeName(elementType)} values, but this one is ${typeName(value.type)}`,
          span: element.span,
          label: `this is ${typeName(value.type)}`,
          secondary: originSpan
            ? [{ span: originSpan, message: `the first item is ${typeName(elementType)}, which sets the element type` }]
            : [],
          notes: [
            "every item of a list has the same type; Koda does not widen them to a common one",
            originSpan
              ? "annotate the binding to choose the element type, as in `values: List<Int> = [...]`"
              : "the expected type sets the element type here",
          ],
        });
        valid = false;
        continue;
      }
      elements.push(value);
    }

    if (!valid || elementType === null) return this.errorValue(span);
    return { kind: "list", elements, type: this.listOf(elementType), span };
  }

  /**
   * `for item in items { ... }` (Slice 5).
   *
   * A statement, never a value. The binding is immutable and body-scoped, and
   * the ordinary no-shadowing rule applies.
   */
  private checkFor(
    statement: Extract<Statement, { kind: "for" }>,
  ): { statement: IRStatement; alwaysReturns: boolean } | null {
    const iterable = this.checkExpression(statement.iterable, null);

    let elementType: KType = ErrorType;
    if (iterable.type.kind !== "Error") {
      if (!this.isList(iterable.type)) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `${article(typeName(iterable.type))} ${typeName(iterable.type)} value cannot be iterated`,
          span: statement.iterable.span,
          label: `this is ${typeName(iterable.type)}`,
          notes: ["`for` walks the items of a List; other types have no items to walk"],
        });
        return null;
      }
      elementType = this.supportedMemberType(iterable.type.arguments[0] ?? ErrorType, statement.nameSpan);
      if (elementType.kind === "Error") return null;
    }

    if (this.lookupLocal(statement.name)) {
      this.duplicate(statement.name, statement.nameSpan, this.lookupLocal(statement.name)!.declarationSpan);
      return null;
    }
    if (RESERVED_PRELUDE_NAMES.has(statement.name) || PRIMITIVE_TYPES.has(statement.name) || PRELUDE_NAMES.has(statement.name)) {
      this.diagnostics.add({
        code: Codes.DuplicateName,
        message: `'${statement.name}' is a reserved name`,
        span: statement.nameSpan,
        label: "choose another name for the loop item",
      });
      return null;
    }

    const binding: LocalSymbol = {
      id: this.nextSymbolId++,
      name: statement.name,
      type: elementType,
      mutable: false,
      declarationSpan: statement.nameSpan,
    };

    this.pushScope();
    this.scopes.at(-1)!.bindings.set(binding.name, binding);
    const body = this.checkBlock(statement.body, UnitType);
    this.scopes.pop();

    if (body.block.tail && body.block.type.kind !== "Unit" && body.block.type.kind !== "Never") {
      this.expect(body.block.tail, UnitType, "a loop body cannot produce a value");
    }

    // A loop may run zero times, so it never proves the function returned.
    return {
      statement: { kind: "for", binding, iterable, body: body.block, type: UnitType, span: statement.span },
      alwaysReturns: false,
    };
  }

  private checkBind(statement: Extract<Statement, { kind: "bind" }>): {
    statement: IRStatement;
    alwaysReturns: boolean;
  } | null {
    const existingLocal = this.lookupLocal(statement.name);
    const existingFunction = this.functions.get(statement.name);

    // A visible binding turns `name = value` into a rebinding (ADR 0011).
    if (existingLocal && !statement.mutable && !statement.declaredType) {
      return this.checkRebind(statement, existingLocal);
    }
    if (existingLocal) {
      this.duplicate(statement.name, statement.nameSpan, existingLocal.declarationSpan);
      const value = this.checkExpression(statement.value, existingLocal.type);
      return {
        statement: { kind: "assign", symbol: existingLocal, value, span: statement.span },
        alwaysReturns: false,
      };
    }
    if (existingFunction) {
      this.duplicate(statement.name, statement.nameSpan, existingFunction.declarationSpan);
      return null;
    }
    if (RESERVED_PRELUDE_NAMES.has(statement.name) || PRIMITIVE_TYPES.has(statement.name)) {
      this.diagnostics.add({
        code: Codes.DuplicateName,
        message: `'${statement.name}' is a prelude name and cannot be used as a binding`,
        span: statement.nameSpan,
        label: "this name is reserved",
      });
      return null;
    }

    const declared = statement.declaredType ? this.resolveType(statement.declaredType, this.typeParameters) : null;
    const value = this.checkExpression(statement.value, declared);
    if (declared) this.expect(value, declared, "this is the value being bound");

    if (!declared && (value.type.kind === "Unit" || value.type.kind === "Never")) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${statement.name}' would be bound to nothing`,
        span: statement.value.span,
        label: "this expression produces no value",
        notes: ["a function returning Unit has no value to bind; call it as its own statement instead"],
      });
      return null;
    }

    const symbol: LocalSymbol = {
      id: this.nextSymbolId++,
      name: statement.name,
      type: declared ?? value.type,
      mutable: statement.mutable,
      declarationSpan: statement.nameSpan,
    };
    this.scopes.at(-1)!.bindings.set(symbol.name, symbol);
    return { statement: { kind: "declare", symbol, value, span: statement.span }, alwaysReturns: false };
  }

  private checkRebind(
    statement: Extract<Statement, { kind: "bind" }>,
    target: LocalSymbol,
  ): { statement: IRStatement; alwaysReturns: boolean } {
    if (!target.mutable) {
      this.diagnostics.add({
        code: Codes.ImmutableAssignment,
        message: `cannot assign to immutable binding '${target.name}'`,
        span: statement.nameSpan,
        label: "assignment requires a mutable binding",
        secondary: [{ span: target.declarationSpan, message: `'${target.name}' was declared here` }],
        notes: [
          "bindings are immutable by default in Koda (ADR 0009)",
          `use \`mut ${target.name} = ...\` at the declaration if rebinding is intentional`,
        ],
        suggestions: [
          {
            message: `declare '${target.name}' as rebindable`,
            span: {
              file: target.declarationSpan.file,
              start: target.declarationSpan.start,
              end: target.declarationSpan.start,
            },
            replacement: "mut ",
            applicability: "needs-review",
          },
        ],
      });
    }
    const value = this.checkExpression(statement.value, target.type);
    // ADR 0009: a mutable binding may be rebound to another value of the same type.
    this.expect(value, target.type, `'${target.name}' holds ${typeName(target.type)} values`);
    return { statement: { kind: "assign", symbol: target, value, span: statement.span }, alwaysReturns: false };
  }

  // ------------------------------------------------------------- expressions

  private checkExpression(expression: Expression, expected: KType | null): IRExpression {
    switch (expression.kind) {
      case "number":
        return this.checkNumeral(expression, expected, false);
      case "bool":
        return { kind: "bool", value: expression.value, type: BoolType, span: expression.span };
      case "null":
        return this.checkNull(expression.span, expected);
      case "string":
        return this.checkString(expression);
      case "name":
        return this.checkName(expression.name, expression.span);
      case "call":
        return this.checkCall(expression, expected);
      case "unary":
        return this.checkUnary(expression, expected);
      case "binary":
        return this.checkBinary(expression, expected);
      case "if":
        return this.checkIf(expression, expected);
      case "paren":
        // Parentheses group, and pass the expected type through unchanged.
        return this.checkExpression(expression.expression, expected);
      case "list":
        return this.checkList(expression, expected);
      case "record":
        return this.checkRecord(expression, expected);
      case "member":
        return this.checkMember(expression, expected);
      case "match":
        return this.checkMatch(expression, expected);
      case "error":
        return this.errorValue(expression.span);
    }
  }

  /**
   * `match value { ... }`.
   *
   * docs/spec/type-system.md: arms are considered in order, unreachable arms
   * are diagnosed, each variant's payload must have the correct arity, and all
   * value-producing arms must agree on a type. Exhaustiveness covers enums,
   * `Bool` and nullable types; this slice implements the enum case only.
   */
  private checkMatch(expression: MatchExpression, expected: KType | null): IRExpression {
    const scrutinee = this.checkExpression(expression.scrutinee, null);

    if (scrutinee.type.kind === "Nullable") {
      return this.checkNullableMatch(expression, scrutinee, expected);
    }

    if (scrutinee.type.kind !== "Enum") {
      if (scrutinee.type.kind !== "Error") {
        this.diagnostics.add({
          code: Codes.Unsupported,
          message: `matching ${article(typeName(scrutinee.type))} ${typeName(scrutinee.type)} value is not available in this compiler slice`,
          span: expression.scrutinee.span,
          label: `this is ${article(typeName(scrutinee.type))} ${typeName(scrutinee.type)}`,
          notes: [
            "docs/spec/type-system.md extends matching to Bool and nullable types as well as enums; this slice implements enums only",
            "use `if` for a Bool, or match on an enum value",
          ],
        });
      }
      this.checkArmsForErrorsOnly(expression);
      return this.errorValue(expression.span);
    }

    const declaration = scrutinee.type.declaration;
    const covered = new Map<string, Span>();
    let catchAll: Span | null = null;
    const arms: IRMatchArm[] = [];

    let resultType: KType | null = null;
    let resultSpan: Span | null = null;
    let reportedTypeClash = false;
    // A pattern that could not be resolved leaves coverage unknown.
    let sawBrokenPattern = false;

    for (const arm of expression.arms) {
      const reachedCatchAll = catchAll;
      const reachable = reachedCatchAll === null;
      if (reachedCatchAll !== null) {
        this.diagnostics.add({
          code: Codes.UnreachableArm,
          message: "this arm can never run",
          span: arm.pattern.span,
          label: "everything left is already matched",
          secondary: [{ span: reachedCatchAll, message: "'_' above matches every remaining value" }],
          notes: ["arms are tried in order, so move this one above the '_' if it should apply"],
        });
      }

      const resolved = this.resolveArmPattern(arm.pattern, declaration, covered, catchAll, reachable, scrutinee.type.arguments);
      if (resolved.catchAll && reachable) catchAll = arm.pattern.span;
      if (resolved.failed && resolved.variant === null && !resolved.catchAll) sawBrokenPattern = true;

      // Pattern bindings live in the arm and nowhere else.
      this.pushScope();
      const bindings: (LocalSymbol | null)[] = [];
      for (const binding of resolved.bindings) {
        bindings.push(binding === null ? null : this.declarePatternBinding(binding.name, binding.type, binding.span));
      }
      const body = this.checkBlock(arm.body, expected);
      this.scopes.pop();

      arms.push({ variant: resolved.variant, bindings, body: body.block, span: arm.span });

      if (!reachable || resolved.failed) continue;

      if (resultType === null) {
        resultType = body.block.type;
        resultSpan = arm.body.span;
        continue;
      }
      const merged = unify(resultType, body.block.type);
      if (merged) {
        // A diverging arm leaves the established type in place.
        if (body.block.type.kind !== "Never") {
          resultType = merged;
          if (resultType.kind !== "Never") resultSpan = resultSpan ?? arm.body.span;
        }
        continue;
      }
      if (!reportedTypeClash) {
        reportedTypeClash = true;
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: "the arms of this match produce different types",
          span: arm.body.span,
          label: `this arm produces ${typeName(body.block.type)}`,
          secondary: resultSpan ? [{ span: resultSpan, message: `an earlier arm produces ${typeName(resultType)}` }] : [],
          notes: [
            "every arm of a match has to produce the same type, because the match itself is one value",
            "Koda never widens the arms to a shared type on its own",
          ],
        });
      }
    }

    const missing = declaration.variants.filter((variant) => !covered.has(variant.name));
    const exhaustive = catchAll !== null || missing.length === 0;
    if (!exhaustive && !sawBrokenPattern) {
      const names = missing.map((variant) => `${declaration.name}.${variant.name}`);
      this.diagnostics.add({
        code: Codes.NonExhaustiveMatch,
        message: `this match does not cover ${names.length === 1 ? "one case" : `${names.length} cases`} of '${declaration.name}'`,
        span: expression.span,
        label: `missing ${names.join(", ")}`,
        secondary: missing.map((variant) => ({
          span: variant.declarationSpan,
          message: `'${variant.name}' is declared here`,
        })),
        notes: [
          "a match covers every variant, so a value can never fall through without an answer",
          `add ${names.length === 1 ? "an arm for it" : "arms for them"}, or a '_' arm for everything else`,
        ],
      });
    }

    const type = resultType ?? (exhaustive ? NeverType : ErrorType);
    return { kind: "match", scrutinee, declaration, arms, type, span: expression.span };
  }

  /**
   * `match x { null => ..., value => ... }`.
   *
   * Slice 1C accepts a `null` arm and a catch-all, in either order. After a
   * `null` arm the binding takes the non-null type; a binding arm placed first
   * catches the remaining nullable domain and makes a later `null` arm
   * unreachable (docs/spec/type-system.md).
   */
  private checkNullableMatch(
    expression: MatchExpression,
    scrutinee: IRExpression,
    expected: KType | null,
  ): IRExpression {
    const declared = scrutinee.type;
    const present = withoutNull(declared);

    let nullArm: Span | null = null;
    let catchAll: Span | null = null;
    const arms: IRNullableArm[] = [];

    let resultType: KType | null = null;
    let resultSpan: Span | null = null;
    let reportedTypeClash = false;
    let sawUnsupportedPattern = false;

    for (const arm of expression.arms) {
      const pattern = arm.pattern;
      let test: "null" | "catch-all" | null = null;
      let bindingName: { name: string; span: Span } | null = null;
      let failed = false;

      if (pattern.kind === "null-pattern") {
        if (nullArm || catchAll) {
          this.unreachableArm(pattern.span, nullArm ?? catchAll!, catchAll !== null);
          failed = true;
        }
        test = "null";
        if (!nullArm) nullArm = pattern.span;
      } else if (pattern.kind === "wildcard" || pattern.kind === "binding") {
        if (catchAll) {
          this.unreachableArm(pattern.span, catchAll, true);
          failed = true;
        }
        test = "catch-all";
        if (pattern.kind === "binding") bindingName = { name: pattern.name, span: pattern.span };
        if (!catchAll) catchAll = pattern.span;
      } else if (pattern.kind === "variant-pattern") {
        const first = !sawUnsupportedPattern;
        sawUnsupportedPattern = true;
        failed = true;
        if (first) {
          this.diagnostics.add({
            code: Codes.Unsupported,
            message: "matching a variant through a nullable value is not available in this compiler slice",
            span: pattern.span,
            label: "this pattern reaches past the absent case",
            notes: [
            `handle absence first, then match the value: \`match x { null => ..., value => match value { ... } }\``,
              "see docs/implementation/slice-1c.md for the supported subset",
            ],
          });
        }
      } else {
        failed = true;
      }

      // The bound value is non-null only once the null case is behind it.
      const bindingType = nullArm !== null && test === "catch-all" ? present : declared;

      this.pushScope();
      const binding = bindingName
        ? this.declarePatternBinding(bindingName.name, bindingType, bindingName.span)
        : null;
      const body = this.checkBlock(arm.body, expected);
      this.scopes.pop();

      if (test !== null) arms.push({ test, binding, body: body.block, span: arm.span });

      if (failed) continue;

      if (resultType === null) {
        resultType = body.block.type;
        resultSpan = arm.body.span;
        continue;
      }
      const merged = unify(resultType, body.block.type);
      if (merged) {
        if (body.block.type.kind !== "Never") resultType = merged;
        continue;
      }
      if (!reportedTypeClash) {
        reportedTypeClash = true;
        this.armTypeClash(arm.body.span, body.block.type, resultType, resultSpan);
      }
    }

    if (!catchAll && !sawUnsupportedPattern) {
      this.diagnostics.add({
        code: Codes.NonExhaustiveMatch,
        message: `this match does not cover the case where the value is present`,
        span: expression.span,
        label: `a ${typeName(present)} value has no arm`,
        notes: [
          "a match covers every case, so a value can never fall through without an answer",
          "add an arm that names the value, as in `value => ...`, or a '_' arm",
        ],
      });
    }

    const type = resultType ?? ErrorType;
    return { kind: "nullable-match", scrutinee, arms, type, span: expression.span };
  }

  private unreachableArm(span: Span, previous: Span, afterCatchAll: boolean): void {
    this.diagnostics.add({
      code: Codes.UnreachableArm,
      message: "this arm can never run",
      span,
      label: afterCatchAll ? "everything left is already matched" : "this case is already matched above",
      secondary: [{ span: previous, message: afterCatchAll ? "this arm matches every remaining value" : "matched here first" }],
      notes: ["arms are tried in order, so only the first arm that fits ever runs"],
    });
  }

  private armTypeClash(span: Span, found: KType, established: KType, establishedSpan: Span | null): void {
    this.diagnostics.add({
      code: Codes.TypeMismatch,
      message: "the arms of this match produce different types",
      span,
      label: `this arm produces ${typeName(found)}`,
      secondary: establishedSpan ? [{ span: establishedSpan, message: `an earlier arm produces ${typeName(established)}` }] : [],
      notes: [
        "every arm of a match has to produce the same type, because the match itself is one value",
        "Koda never widens the arms to a shared type on its own",
      ],
    });
  }

  /** Checks arm bodies for their own errors when the match itself is invalid. */
  private checkArmsForErrorsOnly(expression: MatchExpression): void {
    for (const arm of expression.arms) {
      this.pushScope();
      this.checkBlock(arm.body, null);
      this.scopes.pop();
    }
  }

  /**
   * Resolves one pattern against the matched enum, recording coverage and
   * reporting anything wrong with the pattern itself.
   */
  private resolveArmPattern(
    pattern: Pattern,
    declaration: EnumDeclaration,
    covered: Map<string, Span>,
    catchAll: Span | null,
    reachable: boolean,
    typeArguments: readonly KType[],
  ): {
    variant: VariantSymbol | null;
    catchAll: boolean;
    failed: boolean;
    bindings: ({ name: string; type: KType; span: Span } | null)[];
  } {
    if (pattern.kind === "pattern-error") return { variant: null, catchAll: false, failed: true, bindings: [] };

    if (pattern.kind === "binding") {
      // Slice 1C introduces bare-name binding patterns only for matching a
      // nullable value; they are not generalised to enums here.
      this.diagnostics.add({
        code: Codes.Unsupported,
        message: "a bare name is not available as a whole pattern when matching an enum",
        span: pattern.span,
        label: "this would bind every remaining variant",
        notes: [
          "'_' matches the remaining variants without binding them",
          `a qualified variant such as '${declaration.name}.${declaration.variants[0]?.name ?? "Variant"}' matches one case`,
          "see docs/implementation/slice-1c.md for the supported subset",
        ],
      });
      return { variant: null, catchAll: false, failed: true, bindings: [] };
    }

    if (pattern.kind === "null-pattern") {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${declaration.name}' always holds a value, so it has no null case`,
        span: pattern.span,
        label: "this pattern matches an absent value",
        secondary: [{ span: declaration.nameSpan, message: `the value being matched is ${declaration.name}` }],
        notes: [`declare it as '${declaration.name}?' if it may be absent`],
      });
      return { variant: null, catchAll: false, failed: true, bindings: [] };
    }

    if (pattern.kind === "wildcard") {
      const remaining = declaration.variants.filter((variant) => !covered.has(variant.name));
      if (reachable && catchAll === null && remaining.length === 0 && declaration.variants.length > 0) {
        this.diagnostics.add({
          code: Codes.UnreachableArm,
          message: "this '_' can never run",
          span: pattern.span,
          label: "every variant is already covered above",
          notes: [
            `the arms above already cover all ${declaration.variants.length} variants of '${declaration.name}'`,
            "remove this arm, or remove one of the arms above if it was meant to be replaced",
          ],
        });
        return { variant: null, catchAll: true, failed: true, bindings: [] };
      }
      return { variant: null, catchAll: true, failed: false, bindings: [] };
    }

    if (pattern.enumName === null) {
      // `Ok(value)` is accepted only for the prelude Result. ADR 0011 keeps
      // ordinary user enum variants qualified.
      if (!this.resultDeclaration || !sameDeclarationId(declaration.id, this.resultDeclaration.id)) {
        this.diagnostics.add({
          code: Codes.UnresolvedName,
          message: `'${pattern.variantName}' must say which enum it belongs to`,
          span: pattern.span,
          label: "this variant is not qualified",
          secondary: [{ span: declaration.nameSpan, message: `the value being matched is ${declaration.name}` }],
          notes: [
            `write \`${declaration.name}.${pattern.variantName}\``,
            "only the prelude 'Ok' and 'Err' may be written without their enum name",
          ],
        });
        // Declare whatever names the pattern wrote, so the arm body does not
        // report each of them as unresolved on top of this error.
        return {
          variant: null,
          catchAll: false,
          failed: true,
          bindings: (pattern.payload ?? []).map((sub) =>
            sub.kind === "binding" ? { name: sub.name, type: ErrorType, span: sub.span } : null,
          ),
        };
      }
    } else if (pattern.enumName !== declaration.name) {
      const other = this.enums.get(pattern.enumName);
      if (other) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `'${other.name}.${pattern.variantName}' is not a variant of '${declaration.name}'`,
          span: pattern.span,
          label: `this pattern belongs to '${other.name}'`,
          secondary: [{ span: declaration.nameSpan, message: `the value being matched is ${declaration.name}` }],
          notes: [`write \`${declaration.name}.${pattern.variantName}\` if you meant that variant`],
        });
      } else if (this.records.has(pattern.enumName)) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `'${pattern.enumName}' is a record type, so it has no variants`,
          span: pattern.enumSpan,
          label: "only an enum has variants to match",
        });
      } else {
        this.diagnostics.add({
          code: Codes.UnresolvedName,
          message: `unknown type '${pattern.enumName}'`,
          span: pattern.enumSpan,
          label: "no type with this name is in scope",
          notes: [`the value being matched is '${declaration.name}'`],
        });
      }
      return { variant: null, catchAll: false, failed: true, bindings: [] };
    }

    const variant = declaration.variantsByName.get(pattern.variantName);
    if (!variant) {
      this.unknownMember(
        declaration.name,
        "variant",
        pattern.variantName,
        pattern.variantSpan,
        declaration.variants.map((known) => known.name),
        declaration.nameSpan,
      );
      return { variant: null, catchAll: false, failed: true, bindings: [] };
    }

    const previous = covered.get(variant.name);
    if (previous && reachable) {
      this.diagnostics.add({
        code: Codes.UnreachableArm,
        message: `'${declaration.name}.${variant.name}' is already matched above`,
        span: pattern.span,
        label: "this arm can never run",
        secondary: [{ span: previous, message: "matched here first" }],
        notes: ["arms are tried in order, so only the first arm for a variant ever runs"],
      });
      return { variant, catchAll: false, failed: true, bindings: [] };
    }
    if (!previous) covered.set(variant.name, pattern.span);

    const payload = (variant.payload ?? []).map((field) => instantiatedField(field, declaration.id, typeArguments));
    const written = pattern.payload;

    if (written === null) {
      if (payload.length > 0) {
        const shape = payload.map((field) => field.name).join(", ");
        this.diagnostics.add({
          code: Codes.ArgumentCount,
          message: `'${declaration.name}.${variant.name}' carries ${payload.length === 1 ? "a value" : "values"} that this pattern does not name`,
          span: pattern.span,
          label: `${payload.length} value${payload.length === 1 ? "" : "s"} to match`,
          secondary: [{ span: variant.declarationSpan, message: "declared here" }],
          notes: [
            `write \`${declaration.name}.${variant.name}(${shape})\` to name them, or use '_' for one you do not need`,
          ],
        });
        return { variant, catchAll: false, failed: true, bindings: [] };
      }
      return { variant, catchAll: false, failed: false, bindings: [] };
    }

    if (written.length !== payload.length) {
      this.diagnostics.add({
        code: Codes.ArgumentCount,
        message: `'${declaration.name}.${variant.name}' carries ${payload.length} value${payload.length === 1 ? "" : "s"}, but this pattern names ${written.length}`,
        span: pattern.span,
        label: `this names ${written.length}`,
        secondary: [{ span: variant.declarationSpan, message: "declared here" }],
        notes:
          payload.length === 0
            ? [`'${variant.name}' carries nothing, so write \`${declaration.name}.${variant.name}\``]
            : [`the values are ${payload.map((field) => `${field.name}: ${typeName(field.type)}`).join(", ")}`],
      });
      // Declare whatever names were written, so the arm body does not report
      // each of them as unresolved on top of the arity error.
      return {
        variant,
        catchAll: false,
        failed: true,
        bindings: written.map((sub) =>
          sub.kind === "binding" ? { name: sub.name, type: ErrorType, span: sub.span } : null,
        ),
      };
    }

    const bindings: ({ name: string; type: KType; span: Span } | null)[] = [];
    let failed = false;
    for (const [index, sub] of written.entries()) {
      const field = payload[index]!;
      if (sub.kind === "wildcard") {
        bindings.push(null);
        continue;
      }
      if (sub.kind === "binding") {
        // The binding takes its type from the declared payload field; its name
        // is free and need not match that field (ADR 0011 follow-up).
        bindings.push({ name: sub.name, type: this.supportedMemberType(field.type, sub.span), span: sub.span });
        continue;
      }
      if (sub.kind === "variant-pattern") {
        this.diagnostics.add({
          code: Codes.Unsupported,
          message: "a pattern inside a payload is not available in this compiler slice",
          span: sub.span,
          label: "nested patterns are not supported yet",
          notes: [
            "name the value here and match it separately",
            "see docs/implementation/slice-1b.md for the supported subset",
          ],
        });
      }
      bindings.push(null);
      failed = true;
    }
    return { variant, catchAll: false, failed, bindings };
  }

  /** Declares a pattern binding, honouring ADR 0007's no-shadowing rule. */
  private declarePatternBinding(name: string, type: KType, span: Span): LocalSymbol | null {
    let rejected = false;

    const existingLocal = this.lookupLocal(name);
    if (existingLocal) {
      this.duplicate(name, span, existingLocal.declarationSpan);
      rejected = true;
    } else {
      const moduleName = this.moduleNames.get(name);
      const existingFunction = this.functions.get(name);
      if (moduleName || existingFunction) {
        this.duplicate(name, span, moduleName?.span ?? existingFunction!.declarationSpan);
        rejected = true;
      } else if (PRIMITIVE_TYPES.has(name) || RESERVED_PRELUDE_NAMES.has(name) || PRELUDE_NAMES.has(name)) {
        this.diagnostics.add({
          code: Codes.DuplicateName,
          message: `'${name}' is a prelude name and cannot be used as a pattern binding`,
          span,
          label: "this name is reserved",
        });
        rejected = true;
      }
    }

    // A rejected binding still occupies its name inside this arm, which cannot
    // compile anyway, so the body does not resolve the name to something else
    // and report a second, misleading error.
    const symbol: LocalSymbol = {
      id: this.nextSymbolId++,
      name,
      type: rejected ? ErrorType : type,
      mutable: false,
      declarationSpan: span,
    };
    this.scopes.at(-1)!.bindings.set(name, symbol);
    return rejected ? null : symbol;
  }

  /**
   * `User { name: ..., age: ... }`.
   *
   * docs/spec/type-system.md requires construction to supply every field
   * exactly once and to reject unknown fields. Entries keep their source order
   * so that side effects still run left to right.
   */
  /**
   * The type arguments for a construction site (Slice 3A).
   *
   * They come from exactly two places: arguments written at the site, or an
   * expected type that is an application of this very declaration. Exactly one
   * outer nullable wrapper is looked through, which is the general rule Result
   * was the first instance of. Field and payload values are never consulted, so
   * there are no inference variables and no constraint solving.
   *
   * Returns null when nothing supplies them, after reporting why.
   */
  private resolveConstructionArguments(
    declaration: RecordDeclaration | EnumDeclaration,
    written: readonly TypeRef[] | null,
    expected: KType | null,
    span: Span,
    typeSpan: Span,
  ): readonly KType[] | null {
    // Written arguments are authoritative: they are resolved on their own and
    // never adjusted to satisfy the context. A disagreement becomes an ordinary
    // mismatch at the caller's `expect`.
    if (written !== null) {
      const applied = this.resolveTypeName(
        { name: declaration.name, arguments: written, nullable: false, span: typeSpan },
        this.typeParameters,
      );
      if (applied.kind === "Error") return null;
      if (applied.kind !== "Record" && applied.kind !== "Enum") return null;
      return applied.arguments;
    }

    if (declaration.typeParameters.length === 0) return [];

    // Peel exactly one outer Nullable, and nothing more.
    const target = expected && expected.kind === "Nullable" ? expected.inner : expected;
    if (
      target &&
      (target.kind === "Record" || target.kind === "Enum") &&
      sameDeclarationId(target.declaration.id, declaration.id) &&
      target.arguments.length === declaration.typeParameters.length
    ) {
      return target.arguments;
    }

    this.unconstrainedConstruction(declaration, span, target);
    return null;
  }

  /** A generic construction with nothing to say what its arguments are. */
  private unconstrainedConstruction(
    declaration: RecordDeclaration | EnumDeclaration,
    span: Span,
    found: KType | null,
  ): void {
    const parameters = declaration.typeParameters;
    const names = parameters.map((parameter) => `'${parameter.name}'`).join(", ");
    const sample = parameters.map(() => "Int").join(", ");
    const shape = "fields" in declaration
      ? `${declaration.name}<${sample}> { ... }`
      : `${declaration.name}<${sample}>.${declaration.variants[0]?.name ?? "Variant"}(...)`;
    const notes = [
      `'${declaration.name}' declares ${parameters.length} type parameter${parameters.length === 1 ? "" : "s"}, and a value of it needs every one`,
      `write them, as in \`${shape}\`, or give it a context that names them, such as a return type, an annotated binding, or a parameter`,
      "Koda never infers a type argument from a field's or payload's value",
    ];
    if (found && found.kind !== "Error") {
      notes.unshift(`this position expects ${typeName(found)}, which is not ${article(declaration.name)} ${declaration.name}`);
    }
    this.diagnostics.add({
      code: Codes.TypeMismatch,
      message: `this '${declaration.name}' has no type arguments`,
      span,
      label: `nothing here says what ${names} ${parameters.length === 1 ? "is" : "are"}`,
      secondary: [{ span: declaration.nameSpan, message: `'${declaration.name}' is declared here` }],
      notes,
    });
  }

  private checkRecord(
    expression: Extract<Expression, { kind: "record" }>,
    expected: KType | null,
  ): IRExpression {
    const record = this.records.get(expression.typeName);
    if (!record) {
      const enumeration = this.enums.get(expression.typeName);
      if (enumeration) {
        const first = enumeration.variants[0]?.name ?? "Variant";
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `'${expression.typeName}' is an enum, so it is not built with braces`,
          span: expression.typeSpan,
          label: "this is an enum, not a record",
          secondary: [{ span: enumeration.nameSpan, message: `'${enumeration.name}' is declared here` }],
          notes: [`choose one of its variants, for example \`${enumeration.name}.${first}\``],
        });
      } else {
        this.diagnostics.add({
          code: Codes.UnresolvedName,
          message: `unknown type '${expression.typeName}'`,
          span: expression.typeSpan,
          label: "no type with this name is in scope",
          notes: [
            this.nearestTypeName(expression.typeName)
              ? `a type in scope is spelled '${this.nearestTypeName(expression.typeName)!}'`
              : "declare it with `type Name { ... }` before using it",
          ],
        });
      }
      for (const field of expression.fields) this.checkExpression(field.value, null);
      return this.errorValue(expression.span);
    }

    const args = this.resolveConstructionArguments(
      record,
      expression.typeArguments,
      expected,
      expression.span,
      expression.typeSpan,
    );
    if (args === null) {
      for (const field of expression.fields) this.checkExpression(field.value, null);
      return this.errorValue(expression.span);
    }

    const entries: IRFieldInit[] = [];
    const seen = new Map<string, Span>();
    let structurallyValid = true;

    for (const init of expression.fields) {
      const previous = seen.get(init.name);
      if (previous) {
        this.duplicateMember(init.name, "field", init.nameSpan, previous);
        this.checkExpression(init.value, null);
        structurallyValid = false;
        continue;
      }
      seen.set(init.name, init.nameSpan);

      const declared = record.fieldsByName.get(init.name);
      if (!declared) {
        this.unknownMember(
          record.name,
          "field",
          init.name,
          init.nameSpan,
          record.fields.map((known) => known.name),
          record.nameSpan,
        );
        this.checkExpression(init.value, null);
        structurallyValid = false;
        continue;
      }

      // Slice 2A substitution supplies the instantiated type, so contextual
      // literal typing keeps working through a type parameter (ADR 0008).
      const field = instantiatedField(declared, record.id, args);
      const fieldType = this.supportedMemberType(field.type, init.nameSpan);
      if (fieldType.kind === "Error") {
        this.checkExpression(init.value, ErrorType);
        structurallyValid = false;
        continue;
      }

      const value = this.checkExpression(init.value, fieldType);
      this.expect(value, fieldType, `'${field.name}' is declared ${typeName(fieldType)}`);
      entries.push({ field, value });
    }

    const missing = record.fields.filter((field) => !seen.has(field.name));
    if (missing.length > 0) {
      const names = missing.map((field) => `'${field.name}'`).join(", ");
      this.diagnostics.add({
        code: Codes.IncompleteRecord,
        message: `this '${record.name}' is missing ${missing.length === 1 ? "a field" : "some fields"}: ${names}`,
        span: expression.span,
        label: `${missing.length === 1 ? "this field has" : "these fields have"} no value`,
        secondary: missing.map((field) => ({
          span: field.declarationSpan,
          message: `'${field.name}' is declared here`,
        })),
        notes: [
          "building a record supplies every field exactly once, so a value is never partly filled in",
        ],
      });
      structurallyValid = false;
    }

    if (!structurallyValid) return this.errorValue(expression.span);
    return { kind: "record", declaration: record, entries, type: recordType(record, args), span: expression.span };
  }

  /**
   * `target.name` is a field read when the target is a value, and names a
   * variant when the target is an enum. The parser cannot tell those apart, so
   * the decision happens here against resolved symbols.
   */
  private checkMember(
    expression: Extract<Expression, { kind: "member" }>,
    expected: KType | null = null,
  ): IRExpression {
    if (expression.target.kind === "name" && !this.lookupLocal(expression.target.name)) {
      const enumeration = this.enums.get(expression.target.name);
      if (enumeration) return this.checkVariant(enumeration, expression, null, expression.span, expected);

      const record = this.records.get(expression.target.name);
      if (record) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `'${record.name}' is a type, not a value`,
          span: expression.target.span,
          label: "a value was expected here",
          notes: [`build one first, for example \`${record.name} { ... }\`, then read its fields`],
        });
        return this.errorValue(expression.span);
      }
    }

    const target = this.checkExpression(expression.target, null);
    if (target.type.kind === "Error") return this.errorValue(expression.span);

    if (target.type.kind === "Nullable") {
      this.unsafeNullable(target, typeName(withoutNull(target.type)));
      return this.errorValue(expression.span);
    }

    if (target.type.kind !== "Record") {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `${article(typeName(target.type))} ${typeName(target.type)} value has no fields`,
        span: expression.nameSpan,
        label: `'.' cannot be used on ${typeName(target.type)}`,
        notes:
          target.type.kind === "Enum"
            ? ["an enum value carries one of its variants; reading a payload needs `match`, which is not available yet"]
            : ["fields belong to values built from a `type` declaration"],
      });
      return this.errorValue(expression.span);
    }

    const declaration = target.type.declaration;
    const declaredField = declaration.fieldsByName.get(expression.name);
    const field = declaredField && instantiatedField(declaredField, declaration.id, target.type.arguments);
    if (!field) {
      this.unknownMember(
        declaration.name,
        "field",
        expression.name,
        expression.nameSpan,
        declaration.fields.map((known) => known.name),
        declaration.nameSpan,
      );
      return this.errorValue(expression.span);
    }

    return { kind: "field", target, field, type: this.supportedMemberType(field.type, expression.span), span: expression.span };
  }

  /**
   * `Status.Pending`, or `Status.Paid(...)` when `args` is supplied.
   * A variant with a payload must be called; one without must not be.
   */
  /**
   * Contextual Result construction.
   *
   * A constructor determines only its own payload, so the complete
   * `Result<T, E>` must come from the expected type. Exactly one outer nullable
   * wrapper is looked through; the constructor still produces the underlying
   * `Result<T, E>`, and the ordinary non-null-into-nullable rule performs the
   * injection. Nothing else is inspected - no sibling branches, no later uses,
   * no other wrappers, no inference variables.
   */
  private checkResultConstructor(
    expression: Extract<Expression, { kind: "call" }>,
    constructor: string,
    expected: KType | null,
  ): IRExpression {
    const declaration = this.resultDeclaration;
    const span = expression.span;
    if (!declaration) return this.errorValue(span);

    // Peel exactly one outer Nullable, and nothing more.
    const target = expected && expected.kind === "Nullable" ? expected.inner : expected;

    if (!target || !this.isResult(target)) {
      for (const argument of expression.args) this.checkExpression(argument, null);
      this.unconstrainedResult(constructor, span, target);
      return this.errorValue(span);
    }

    const args = target.arguments;
    const variant = declaration.variantsByName.get(constructor)!;
    const field = instantiatedField(variant.payload![0]!, declaration.id, args);

    if (expression.args.length !== 1) {
      this.diagnostics.add({
        code: Codes.ArgumentCount,
        message: `'${constructor}' takes exactly one value, but ${expression.args.length} ${expression.args.length === 1 ? "was" : "were"} given`,
        span,
        label: `this gives ${expression.args.length}`,
        notes: [`write \`${constructor}(${field.name})\`, where ${field.name} is ${typeName(field.type)}`],
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    const value = this.checkExpression(expression.args[0]!, field.type);
    this.expect(value, field.type, `'${constructor}' carries ${typeName(field.type)} here`);

    // The constructor's own type is the underlying Result, never the nullable.
    return { kind: "variant", declaration, variant, args: [value], type: enumType(declaration, args), span };
  }

  /** `Ok(...)` / `Err(...)` with nothing to say what the other side holds. */
  private unconstrainedResult(constructor: string, span: Span, found: KType | null): void {
    const missing = constructor === RESULT_OK ? "error" : "success";
    const other = constructor === RESULT_OK ? RESULT_ERR : RESULT_OK;
    const notes = [
      `'${constructor}' says what the ${constructor === RESULT_OK ? "success" : "error"} value is, but nothing here says what '${other}' would hold`,
      "give it a context that names both sides, such as a return type `-> Result<Value, Error>`, an annotated binding, or a parameter",
      "Koda never invents the missing type",
    ];
    if (found && found.kind !== "Error") {
      notes.unshift(`this position expects ${typeName(found)}, which is not a Result`);
    }
    this.diagnostics.add({
      code: Codes.TypeMismatch,
      message: `this '${constructor}' has no ${missing} type`,
      span,
      label: `nothing here says what '${other}' would hold`,
      notes,
    });
  }

  private checkVariant(
    declaration: EnumDeclaration,
    member: Extract<Expression, { kind: "member" }>,
    args: readonly Expression[] | null,
    span: Span,
    expected: KType | null = null,
  ): IRExpression {
    if (this.resultDeclaration && sameDeclarationId(declaration.id, this.resultDeclaration.id)) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'Result.${member.name}' is not how a Result is built`,
        span,
        label: "the prelude constructors are written without the enum name",
        notes: [`write \`${member.name}(...)\` on its own`],
      });
      for (const argument of args ?? []) this.checkExpression(argument, null);
      return this.errorValue(span);
    }
    const typeArguments = this.resolveConstructionArguments(
      declaration,
      member.typeArguments,
      expected,
      span,
      member.target.span,
    );
    if (typeArguments === null) {
      for (const argument of args ?? []) this.checkExpression(argument, null);
      return this.errorValue(span);
    }
    const variant = declaration.variantsByName.get(member.name);
    if (!variant) {
      this.unknownMember(
        declaration.name,
        "variant",
        member.name,
        member.nameSpan,
        declaration.variants.map((known) => known.name),
        declaration.nameSpan,
      );
      for (const argument of args ?? []) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    const declaredPayload = variant.payload ?? [];
    // Slice 2A substitution supplies the instantiated payload types.
    const payload = declaredPayload.map((field) => instantiatedField(field, declaration.id, typeArguments));
    const type = enumType(declaration, typeArguments);

    if (args === null) {
      if (payload.length > 0) {
        const shape = payload.map((field) => `${field.name}: ${typeName(field.type)}`).join(", ");
        this.diagnostics.add({
          code: Codes.ArgumentCount,
          message: `'${declaration.name}.${variant.name}' carries ${payload.length === 1 ? "a value" : "values"}`,
          span,
          label: "this variant is named but never given its values",
          secondary: [{ span: variant.declarationSpan, message: "declared here" }],
          notes: [`write \`${declaration.name}.${variant.name}(${shape})\``],
        });
        return this.errorValue(span);
      }
      return { kind: "variant", declaration, variant, args: [], type, span };
    }

    if (args.length !== payload.length) {
      this.diagnostics.add({
        code: Codes.ArgumentCount,
        message: `'${declaration.name}.${variant.name}' takes ${payload.length} value${payload.length === 1 ? "" : "s"}, but ${args.length} ${args.length === 1 ? "was" : "were"} given`,
        span,
        label: `this gives ${args.length}`,
        secondary: [{ span: variant.declarationSpan, message: "declared here" }],
        notes:
          payload.length === 0
            ? [`'${variant.name}' carries nothing, so write \`${declaration.name}.${variant.name}\``]
            : [`the values are ${payload.map((field) => `${field.name}: ${typeName(field.type)}`).join(", ")}`],
      });
    }

    const checked: IRExpression[] = [];
    let payloadValid = true;
    for (const [index, argument] of args.entries()) {
      const field = payload[index];
      const fieldType = field ? this.supportedMemberType(field.type, argument.span) : null;
      if (field && fieldType!.kind === "Error") {
        this.checkExpression(argument, ErrorType);
        payloadValid = false;
        continue;
      }
      const value = this.checkExpression(argument, fieldType);
      if (field) this.expect(value, fieldType!, `'${field.name}' is declared ${typeName(fieldType!)}`);
      checked.push(value);
    }
    if (!payloadValid) return this.errorValue(span);
    if (checked.length !== payload.length) return this.errorValue(span);

    return { kind: "variant", declaration, variant, args: checked, type, span };
  }

  private errorValue(span: Span): IRExpression {
    return { kind: "bool", value: false, type: ErrorType, span };
  }

  /**
   * `null` has no type of its own. The expected type supplies one; without a
   * nullable expectation it is rejected, because inference must not invent an
   * unsafe type (docs/spec/type-system.md).
   */
  private checkNull(span: Span, expected: KType | null): IRExpression {
    if (expected && expected.kind === "Nullable") {
      return { kind: "null", type: expected, span };
    }
    // An already-failed expectation absorbs, so a recovery path does not turn
    // one error into two (types.ts: Error absorbs to suppress cascades).
    if (expected && expected.kind === "Error") return this.errorValue(span);
    if (expected) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `expected ${typeName(expected)}, found null`,
        span,
        label: `${typeName(expected)} always holds a value`,
        notes: [
          `write '${typeName(expected)}?' where the value may be absent`,
          "null is not a value of a non-nullable type",
        ],
      });
      return this.errorValue(span);
    }
    this.diagnostics.add({
      code: Codes.TypeMismatch,
      message: "this null has no type",
      span,
      label: "nothing here says what may be absent",
      notes: [
        "annotate the binding, as in `name: String? = null`, or pass null where a nullable type is expected",
        "Koda never guesses a type for a bare null",
      ],
    });
    return this.errorValue(span);
  }

  /**
   * Contextual literal typing (ADR 0008). The expected type selects Int or
   * Float before the numeral becomes a value; anything else falls back to the
   * numeral's default category, leaving the caller to report the mismatch.
   */
  private checkNumeral(literal: NumberLiteral, expected: KType | null, negated: boolean): IRExpression {
    const target = expected && isNumeric(expected) ? expected : literal.category === "int" ? IntType : FloatType;
    const span = literal.span;

    if (target.kind === "Int") {
      const result = numeralAsInt(literal.raw, literal.category, negated);
      if (!result.ok) {
        this.numeralRejection(literal, result.reason, negated, span);
        return this.errorValue(span);
      }
      return { kind: "int", value: result.value, type: IntType, span };
    }

    const result = numeralAsFloat(literal.raw, literal.category, negated);
    if (!result.ok) {
      this.numeralRejection(literal, result.reason, negated, span);
      return this.errorValue(span);
    }
    // ADR 0008 S06 allows a warning when a nonzero literal underflows to zero.
    if (underflowedToZero(literal.raw, result.value)) {
      this.diagnostics.add({
        code: Codes.NumericLiteral,
        severity: "warning",
        message: `the number ${literal.raw} is too small for Float and becomes zero`,
        span,
        label: "this value rounds to zero",
        notes: ["this is a valid Float result, not an error (ADR 0008)"],
      });
    }
    return { kind: "float", value: result.value, type: FloatType, span };
  }

  private numeralRejection(literal: NumberLiteral, reason: NumeralRejection, negated: boolean, span: Span): void {
    const text = `${negated ? "-" : ""}${literal.raw}`;
    switch (reason.kind) {
      case "int-range":
        this.diagnostics.add({
          code: Codes.NumericLiteral,
          message: `the number ${text} does not fit in Int`,
          span,
          label: "this value is outside Int's range",
          notes: [`Int holds whole numbers from ${INT_MIN} through ${INT_MAX} (ADR 0008)`],
        });
        return;
      case "not-integral":
        this.diagnostics.add({
          code: Codes.NumericLiteral,
          message: `Int was expected here, but ${text} is not a whole number`,
          span,
          label: "this number has a fractional part",
          notes: ["Koda never converts between Int and Float on its own"],
        });
        return;
      case "inexact-as-float":
        this.diagnostics.add({
          code: Codes.NumericLiteral,
          message: `Float was expected here, but ${text} cannot be stored exactly as a Float`,
          span,
          label: "this whole number would be rounded",
          notes: ["ADR 0008 requires a literal retargeted to Float to be exactly representable"],
        });
        return;
      case "negative-zero-as-int":
        this.diagnostics.add({
          code: Codes.NumericLiteral,
          message: "Int was expected here, but negative zero cannot keep its sign as an Int",
          span,
          label: "this value is negative zero",
          notes: ["Int has a single zero; use Float if the sign matters"],
        });
        return;
      case "malformed":
        this.diagnostics.add({
          code: Codes.InvalidLiteral,
          message: `'${literal.raw}' is not a valid number`,
          span,
          label: "this numeral cannot be read",
        });
    }
  }

  private checkString(expression: Extract<Expression, { kind: "string" }>): IRExpression {
    const parts: IRInterpolationPart[] = [];
    let onlyText = true;

    for (const part of expression.parts) {
      if (part.kind === "text") {
        parts.push({ kind: "text", value: part.value });
        continue;
      }
      onlyText = false;
      const value = this.checkExpression(part.expression, null);
      // ADR 0008 fixes numeric interpolation text; other conversions remain to
      // be specified, so only String, Int and Float are accepted here.
      if (value.type.kind !== "Error" && !INTERPOLATABLE.has(value.type.kind)) {
        this.diagnostics.add({
          code: Codes.Unsupported,
          message: `a ${typeName(value.type)} value cannot be placed inside a string yet`,
          span: part.expression.span,
          label: "this value has no defined text form",
          notes: [
            "ADR 0008 fixes numeric text; the conversion rules for other types are still to be specified",
            "interpolate a String, an Int or a Float",
          ],
        });
      }
      parts.push({ kind: "value", value });
    }

    if (onlyText) {
      const value = parts.map((part) => (part.kind === "text" ? part.value : "")).join("");
      return { kind: "string", value, type: StringType, span: expression.span };
    }
    return { kind: "interpolate", parts, type: StringType, span: expression.span };
  }

  private checkName(name: string, span: Span): IRExpression {
    const local = this.lookupLocal(name);
    if (local) {
      const refined = this.lookupRefinement(local.id) ?? local.type;
      return { kind: "local", symbol: local, type: refined, span };
    }

    const fn = this.functions.get(name);
    if (fn) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${name}' is a function and cannot be used as a value`,
        span,
        label: "this name refers to a function",
        notes: [`call it as \`${name}(...)\`; Koda v0.1 has no first-class functions`],
      });
      return this.errorValue(span);
    }

    const record = this.records.get(name);
    if (record) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${record.name}' is a type, not a value`,
        span,
        label: "a value was expected here",
        secondary: [{ span: record.nameSpan, message: `'${record.name}' is declared here` }],
        notes: [`build one with \`${record.name} { ... }\``],
      });
      return this.errorValue(span);
    }

    const enumeration = this.enums.get(name);
    if (enumeration) {
      const first = enumeration.variants[0]?.name ?? "Variant";
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${enumeration.name}' is a type, not a value`,
        span,
        label: "a value was expected here",
        secondary: [{ span: enumeration.nameSpan, message: `'${enumeration.name}' is declared here` }],
        notes: [`choose one of its variants, for example \`${enumeration.name}.${first}\``],
      });
      return this.errorValue(span);
    }

    const reserved = RESERVED_PRELUDE_NAMES.get(name);
    if (reserved) {
      this.diagnostics.add({
        code: Codes.Unsupported,
        message: `'${name}' is not available in this compiler slice`,
        span,
        label: "this prelude name is not supported yet",
        notes: [reserved, "see docs/implementation/slice-0.md for the supported subset"],
      });
      return this.errorValue(span);
    }

    const suggestion = this.nearestVisibleName(name);
    this.diagnostics.add({
      code: Codes.UnresolvedName,
      message: `cannot find '${name}'`,
      span,
      label: "no binding or function with this name is in scope",
      notes: suggestion ? [`a name in scope is spelled '${suggestion}'`] : [],
      suggestions: suggestion
        ? [{ message: `use '${suggestion}'`, span, replacement: suggestion, applicability: "needs-review" }]
        : [],
    });
    return this.errorValue(span);
  }

  /**
   * `items.length()`, `items.isEmpty()` and `items.get(index)` (Slice 5).
   *
   * These are compiler intrinsics rather than declared functions, so the
   * checker fixes their signatures here and the IR keeps them out of the call
   * path - a call transfers its arguments, which would discharge the receiver's
   * whole collective responsibility on a single `get` (ADR 0010, R2).
   */
  private checkListOperation(
    receiver: IRExpression,
    callee: Extract<Expression, { kind: "member" }>,
    expression: Extract<Expression, { kind: "call" }>,
    span: Span,
  ): IRExpression {
    const element = this.isList(receiver.type) ? receiver.type.arguments[0] ?? ErrorType : ErrorType;
    const name = callee.name;

    if (name !== "length" && name !== "isEmpty" && name !== "get" && name !== "append") {
      this.unknownMember(typeName(receiver.type), "operation", name, callee.nameSpan, ["length", "isEmpty", "get", "append"], callee.nameSpan);
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    if (callee.typeArguments !== null) {
      this.diagnostics.add({
        code: Codes.TypeArgumentCount,
        message: `'${name}' does not accept type arguments`,
        span,
        label: "a list operation takes none",
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    const wanted = name === "get" || name === "append" ? 1 : 0;
    if (expression.args.length !== wanted) {
      this.diagnostics.add({
        code: Codes.ArgumentCount,
        message: `'${name}' takes ${wanted} argument${wanted === 1 ? "" : "s"}, but ${expression.args.length} ${expression.args.length === 1 ? "was" : "were"} given`,
        span,
        label: `this call passes ${expression.args.length}`,
        notes: name === "get"
          ? ["write `items.get(index)`, where index is an Int"]
          : name === "append"
            ? [`write \`items.append(value)\`, where value is ${typeName(element)}`]
            : [`write \`items.${name}()\``],
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    if (name === "length" || name === "isEmpty") {
      const type = name === "length" ? IntType : BoolType;
      return { kind: "list-op", operation: name, target: receiver, index: null, type, span };
    }

    if (name === "append") {
      // Slice 6A: persistent. The result is a new List<T>; the receiver is
      // never changed. The argument is checked against the instantiated
      // element type, so ordinary contextual rules reach it.
      if (element.kind === "Error") return this.errorValue(span);
      const elementType = this.supportedMemberType(element, span);
      if (elementType.kind === "Error") return this.errorValue(span);
      const value = this.checkExpression(expression.args[0]!, elementType);
      this.expect(value, elementType, `'append' adds ${typeName(elementType)} values to this list`);
      if (value.type.kind === "Error") return this.errorValue(span);
      return { kind: "list-op", operation: "append", target: receiver, index: value, type: receiver.type, span };
    }

    const index = this.checkExpression(expression.args[0]!, IntType);
    this.expect(index, IntType, "a list index is an Int");
    if (index.type.kind === "Error" || element.kind === "Error") return this.errorValue(span);

    // An index that names no element is an absent value, not a failed
    // operation, so `get` is nullable rather than a Result (ADR 0007).
    const type = this.supportedMemberType(nullableType(element), span);
    if (type.kind === "Error") return this.errorValue(span);
    return { kind: "list-op", operation: "get", target: receiver, index, type, span };
  }

  /**
   * `text.length()`, `get`, `startsWith`, `endsWith` and `contains` (Slice 6B).
   *
   * Compiler-known and read-only. Every one counts Unicode scalar values, not
   * UTF-16 code units, and `get` returns `String?` because an index naming no
   * scalar is an absent value rather than a failed operation.
   */
  private checkStringOperation(
    receiver: IRExpression,
    callee: Extract<Expression, { kind: "member" }>,
    expression: Extract<Expression, { kind: "call" }>,
    span: Span,
  ): IRExpression {
    const name = callee.name;
    const predicates = new Set(["startsWith", "endsWith", "contains"]);
    const known = name === "length" || name === "get" || predicates.has(name);

    if (!known) {
      this.unknownMember("String", "operation", name, callee.nameSpan, ["length", "get", "startsWith", "endsWith", "contains"], callee.nameSpan);
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    if (callee.typeArguments !== null) {
      this.diagnostics.add({
        code: Codes.TypeArgumentCount,
        message: `'${name}' does not accept type arguments`,
        span,
        label: "a string operation takes none",
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    const wanted = name === "length" ? 0 : 1;
    if (expression.args.length !== wanted) {
      this.diagnostics.add({
        code: Codes.ArgumentCount,
        message: `'${name}' takes ${wanted} argument${wanted === 1 ? "" : "s"}, but ${expression.args.length} ${expression.args.length === 1 ? "was" : "were"} given`,
        span,
        label: `this call passes ${expression.args.length}`,
        notes: name === "length"
          ? ["write `text.length()`"]
          : name === "get"
            ? ["write `text.get(index)`, where index is an Int"]
            : [`write \`text.${name}(value)\`, where value is a String`],
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(span);
    }

    if (name === "length") {
      return { kind: "string-op", operation: "length", target: receiver, argument: null, type: IntType, span };
    }

    if (name === "get") {
      const index = this.checkExpression(expression.args[0]!, IntType);
      this.expect(index, IntType, "a string index is an Int");
      if (index.type.kind === "Error") return this.errorValue(span);
      // One scalar value, or absence when the index names none (ADR 0007).
      return { kind: "string-op", operation: "get", target: receiver, argument: index, type: nullableType(StringType), span };
    }

    const value = this.checkExpression(expression.args[0]!, StringType);
    this.expect(value, StringType, `'${name}' compares String values`);
    if (value.type.kind === "Error") return this.errorValue(span);
    const operation = name === "startsWith" ? "startsWith" : name === "endsWith" ? "endsWith" : "contains";
    return { kind: "string-op", operation, target: receiver, argument: value, type: BoolType, span };
  }

  /** `value.name(...)` where `value` is not a list and holds no function. */
  private checkNonListMemberCall(
    receiver: IRExpression,
    callee: Extract<Expression, { kind: "member" }>,
    expression: Extract<Expression, { kind: "call" }>,
  ): IRExpression {
    this.diagnostics.add({
      code: Codes.TypeMismatch,
      message: `'${callee.name}' cannot be called`,
      span: expression.span,
      label: `${article(typeName(receiver.type))} ${typeName(receiver.type)} value has no operations`,
      notes: ["Koda v0.1 has no first-class functions, so a field never holds one"],
    });
    for (const argument of expression.args) this.checkExpression(argument, null);
    return this.errorValue(expression.span);
  }

  private checkCall(
    expression: Extract<Expression, { kind: "call" }>,
    expected: KType | null = null,
  ): IRExpression {
    // `Ok(...)` / `Err(...)` are the prelude Result constructors. They are the
    // only calls that read the expected type, and they read nothing else.
    if (expression.callee.kind === "name") {
      const calleeName = expression.callee.name;
      if (calleeName === RESULT_OK || calleeName === RESULT_ERR) {
        return this.checkResultConstructor(expression, calleeName, expected);
      }
    }

    // `Status.Paid(...)` is a variant construction rather than a function call.
    if (expression.callee.kind === "member") {
      const callee = expression.callee;

      // Slice 5 list intrinsics. Checked before the variant path so a local
      // holding a List is never mistaken for an enum name.
      if (callee.target.kind !== "name" || this.lookupLocal(callee.target.name)) {
        const receiver = this.checkExpression(callee.target, null);
        if (this.isList(receiver.type)) {
          return this.checkListOperation(receiver, callee, expression, expression.span);
        }
        if (receiver.type.kind === "String") {
          return this.checkStringOperation(receiver, callee, expression, expression.span);
        }
        if (receiver.type.kind !== "Error") {
          return this.checkNonListMemberCall(receiver, callee, expression);
        }
        for (const argument of expression.args) this.checkExpression(argument, null);
        return this.errorValue(expression.span);
      }

      if (callee.target.kind === "name" && !this.lookupLocal(callee.target.name)) {
        const enumeration = this.enums.get(callee.target.name);
        if (enumeration) {
          return this.checkVariant(enumeration, callee, expression.args, expression.span, expected);
        }
      }
      this.checkMember(callee);
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${callee.name}' cannot be called`,
        span: expression.span,
        label: "only a declared function or an enum variant can be called",
        notes: ["Koda v0.1 has no first-class functions, so a field never holds one"],
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(expression.span);
    }

    const name = expression.callee.name;
    const record = this.records.get(name);
    if (record) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${record.name}' is built with braces, not with parentheses`,
        span: expression.span,
        label: "a record is not called like a function",
        secondary: [{ span: record.nameSpan, message: `'${record.name}' is declared here` }],
        notes: [
          `write \`${record.name} { ${record.fields.map((field) => `${field.name}: ...`).join(", ")} }\``,
        ],
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(expression.span);
    }
    const enumeration = this.enums.get(name);
    if (enumeration) {
      const first = enumeration.variants[0]?.name ?? "Variant";
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${enumeration.name}' is an enum, so it is not called directly`,
        span: expression.span,
        label: "choose a variant instead",
        secondary: [{ span: enumeration.nameSpan, message: `'${enumeration.name}' is declared here` }],
        notes: [`write \`${enumeration.name}.${first}\``],
      });
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(expression.span);
    }

    const target = this.functions.get(name);
    if (!target) {
      if (this.lookupLocal(name)) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `'${name}' is a value, not a function`,
          span: expression.callee.span,
          label: "this name cannot be called",
        });
      } else {
        this.checkName(name, expression.callee.span);
      }
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(expression.span);
    }

    // Slice 4A: type arguments are always written, never inferred.
    const typeArguments = this.resolveCallTypeArguments(target, expression, name);
    if (typeArguments === null) {
      for (const argument of expression.args) this.checkExpression(argument, null);
      return this.errorValue(expression.span);
    }

    if (expression.args.length !== target.parameters.length) {
      const wanted = target.parameters.length;
      const given = expression.args.length;
      this.diagnostics.add({
        code: Codes.ArgumentCount,
        message: `'${name}' takes ${wanted} argument${wanted === 1 ? "" : "s"}, but ${given} ${given === 1 ? "was" : "were"} given`,
        span: expression.span,
        label: `this call passes ${given}`,
        secondary: [{ span: target.declarationSpan, message: `'${name}' is declared here` }],
      });
    }

    // One checked declaration, substituted at the call. No instantiated symbol
    // is created and no body is re-checked.
    const instantiate = (type: KType, span: Span): KType =>
      typeArguments.length === 0
        ? type
        : this.supportedMemberType(substitute(type, target.declarationId, typeArguments), span);

    const args: IRExpression[] = [];
    for (const [index, argument] of expression.args.entries()) {
      const parameter = target.parameters[index];
      // A parameter position supplies the expected type to a literal (ADR 0008).
      const expectedType = parameter ? instantiate(parameter.type, argument.span) : null;
      const value = this.checkExpression(argument, expectedType);
      if (parameter && expectedType) {
        this.expect(value, expectedType, `'${parameter.name}' expects ${typeName(expectedType)}`);
      }
      args.push(value);
    }
    if (args.length !== target.parameters.length) return this.errorValue(expression.span);

    const returnType = instantiate(target.returnType, expression.span);
    return { kind: "call", target, typeArguments, args, type: returnType, span: expression.span };
  }

  /**
   * The written type arguments for a call (Slice 4A).
   *
   * They are always written: a generic function called without them is an
   * error, never a request to infer. Returns null after reporting.
   */
  private resolveCallTypeArguments(
    target: FunctionSymbol,
    expression: Extract<Expression, { kind: "call" }>,
    name: string,
  ): readonly KType[] | null {
    const declared = target.typeParameters.length;
    const written = expression.typeArguments;

    if (written === null) {
      if (declared === 0) return [];
      this.diagnostics.add({
        code: Codes.TypeArgumentCount,
        message: `'${name}' needs ${declared} type argument${declared === 1 ? "" : "s"}, and this call writes none`,
        span: expression.span,
        label: "supply every type argument explicitly",
        secondary: [{ span: target.declarationSpan, message: `'${name}' is declared here` }],
        notes: [
          `write them before the arguments, as in \`${name}<${target.typeParameters.map(() => "Int").join(", ")}>(...)\``,
          "Koda does not infer type arguments; they are always written",
        ],
      });
      return null;
    }

    if (declared === 0) {
      this.diagnostics.add({
        code: Codes.TypeArgumentCount,
        message: `'${name}' does not accept type arguments`,
        span: expression.span,
        label: "this function declares no type parameters",
        secondary: [{ span: target.declarationSpan, message: `'${name}' is declared here` }],
      });
      return null;
    }

    if (written.length !== declared) {
      this.diagnostics.add({
        code: Codes.TypeArgumentCount,
        message: `'${name}' expects ${declared} type argument${declared === 1 ? "" : "s"}, but received ${written.length}`,
        span: expression.span,
        label: "supply every type argument explicitly",
        secondary: [{ span: target.declarationSpan, message: `'${name}' is declared here` }],
        notes: ["type arguments cannot be omitted, inferred, defaulted or partially applied"],
      });
      return null;
    }

    const resolved = written.map((reference) => this.resolveType(reference, this.typeParameters));
    return resolved.some((type) => type.kind === "Error") ? null : resolved;
  }

  private checkUnary(expression: Extract<Expression, { kind: "unary" }>, expected: KType | null): IRExpression {
    const span = expression.span;

    if (expression.operator === "!") {
      const operand = this.checkExpression(expression.operand, BoolType);
      this.expect(operand, BoolType, "'!' needs a Bool value");
      return { kind: "not", operand, type: BoolType, span };
    }

    // A *directly* negated numeral is range-checked as a signed value (ADR 0008
    // S10), which is what makes -9223372036854775808 a valid Int. Parentheses
    // break that adjacency on purpose: in `-(9223372036854775808)` the positive
    // numeral has to inhabit Int before the negation applies, and it cannot.
    if (expression.operand.kind === "number") {
      return this.checkNumeral(expression.operand, expected, true);
    }

    const operand = this.checkExpression(expression.operand, expected && isNumeric(expected) ? expected : null);
    if (operand.type.kind === "Int") return { kind: "int-negate", operand, type: IntType, span };
    if (operand.type.kind === "Float") return { kind: "float-negate", operand, type: FloatType, span };
    if (operand.type.kind !== "Error") {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'-' cannot be applied to ${typeName(operand.type)}`,
        span,
        label: "negation needs an Int or a Float",
      });
    }
    return this.errorValue(span);
  }

  private checkBinary(expression: Extract<Expression, { kind: "binary" }>, expected: KType | null): IRExpression {
    const { operator, span, operatorSpan } = expression;

    // A null comparison is an absence test wherever it appears, not only in a
    // control head. Only its *refinement* is limited to conditions, which is
    // why the result is used here for its value alone.
    if (operator === "==" || operator === "!=") {
      const test = this.checkNullTest(expression);
      if (test) return test.ir;
    }

    if (operator === "&&" || operator === "||") {
      const left = this.checkExpression(expression.left, BoolType);
      const right = this.checkExpression(expression.right, BoolType);
      this.expect(left, BoolType, `'${operator}' needs Bool values`);
      this.expect(right, BoolType, `'${operator}' needs Bool values`);
      return { kind: "logical", operator, left, right, type: BoolType, span };
    }

    const isArithmetic = operator === "+" || operator === "-" || operator === "*" || operator === "/" || operator === "%";
    // Only an outer expectation reaches the operands; a sibling never supplies
    // one, which is what makes `1 + 1.0` a mismatch (ADR 0008).
    const contextual =
      isArithmetic && expected && (isNumeric(expected) || (operator === "+" && expected.kind === "String"))
        ? expected
        : null;

    const left = this.checkExpression(expression.left, contextual);
    const right = this.checkExpression(expression.right, contextual);
    if (left.type.kind === "Error" || right.type.kind === "Error") return this.errorValue(span);

    if (left.type.kind !== right.type.kind) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${operator}' needs both sides to have the same type`,
        span: operatorSpan,
        label: `${typeName(left.type)} on the left, ${typeName(right.type)} on the right`,
        secondary: [
          { span: expression.left.span, message: `this is ${typeName(left.type)}` },
          { span: expression.right.span, message: `this is ${typeName(right.type)}` },
        ],
        notes:
          isNumeric(left.type) && isNumeric(right.type)
            ? ["Koda never converts between Int and Float on its own; convert one side explicitly (ADR 0008)"]
            : [],
      });
      return this.errorValue(span);
    }

    const operandType = left.type;

    if (operator === "==" || operator === "!=") {
      if (!hasEquality(operandType)) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `${typeName(operandType)} values cannot be compared with '${operator}'`,
          span: operatorSpan,
          label: "this type has no equality in v0.1",
          notes: [
            "v0.1 supports equality on Bool, String, Int and Float (ADR 0007)",
            "ADR 0007 defers derived equality for user-defined types, so records and enums have none yet",
          ],
        });
        return this.errorValue(span);
      }
      return { kind: "equal", operandType, negated: operator === "!=", left, right, type: BoolType, span };
    }

    if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
      if (!isNumeric(operandType)) {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `${typeName(operandType)} values cannot be ordered with '${operator}'`,
          span: operatorSpan,
          label: "ordering needs Int or Float values",
          notes: ["ordering is numeric only in v0.1 (docs/spec/type-system.md)"],
        });
        return this.errorValue(span);
      }
      return { kind: "compare", operandType, operator, left, right, type: BoolType, span };
    }

    if (operandType.kind === "String") {
      if (operator !== "+") {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: `'${operator}' cannot be applied to String values`,
          span: operatorSpan,
          label: "only '+' joins two strings",
        });
        return this.errorValue(span);
      }
      return { kind: "concat", left, right, type: StringType, span };
    }

    if (!isNumeric(operandType)) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `'${operator}' cannot be applied to ${typeName(operandType)} values`,
        span: operatorSpan,
        label: "arithmetic needs Int or Float values",
      });
      return this.errorValue(span);
    }

    if (operandType.kind === "Float") {
      if (operator === "%") {
        this.diagnostics.add({
          code: Codes.Unsupported,
          message: "Float remainder is not part of Koda v0.1",
          span: operatorSpan,
          label: "'%' is not defined for Float",
          notes: ["ADR 0008 explicitly defers Float remainder"],
        });
        return this.errorValue(span);
      }
      return { kind: "float-arith", operator, left, right, type: FloatType, span };
    }

    return { kind: "int-arith", operator, left, right, type: IntType, span };
  }

  /**
   * Checks a condition and reports what it proves in each branch.
   *
   * Only two forms refine (ADR 0007 follow-up): a direct null comparison, and
   * `&&`, whose right operand is checked under the refinements its left
   * operand established. `||`, negation and an intermediate Bool are
   * deliberately not sources of refinement.
   */
  private checkCondition(expression: Expression): CheckedCondition {
    if (expression.kind === "paren") return this.checkCondition(expression.expression);

    if (expression.kind === "binary" && expression.operator === "&&") {
      const left = this.checkCondition(expression.left);
      // The right operand sees what the left one proved.
      this.pushScope(left.whenTrue);
      const right = this.checkCondition(expression.right);
      this.scopes.pop();

      this.expect(left.ir, BoolType, "'&&' needs Bool values");
      this.expect(right.ir, BoolType, "'&&' needs Bool values");
      return {
        ir: {
          kind: "logical",
          operator: "&&",
          left: left.ir,
          right: right.ir,
          type: BoolType,
          span: expression.span,
        },
        // Both must hold for the whole condition to be true. Nothing follows
        // from it being false, so the else branch learns nothing.
        whenTrue: [...left.whenTrue, ...right.whenTrue],
        whenFalse: [],
      };
    }

    if (expression.kind === "binary" && (expression.operator === "==" || expression.operator === "!=")) {
      const test = this.checkNullTest(expression);
      if (test) return test;
    }

    const ir = this.checkExpression(expression, BoolType);
    return { ir, whenTrue: [], whenFalse: [] };
  }

  /**
   * `x != null` / `x == null`.
   *
   * Returns null when neither side is the null literal, leaving ordinary
   * equality to handle the expression.
   */
  private checkNullTest(expression: Extract<Expression, { kind: "binary" }>): CheckedCondition | null {
    const leftIsNull = this.isNullLiteral(expression.left);
    const rightIsNull = this.isNullLiteral(expression.right);
    if (!leftIsNull && !rightIsNull) return null;

    const negated = expression.operator === "!=";
    const span = expression.span;

    if (leftIsNull && rightIsNull) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: "this comparison has nothing to test",
        span,
        label: "both sides are null",
        notes: ["compare a value that may be absent against null, as in `name != null`"],
      });
      return { ir: this.errorValue(span), whenTrue: [], whenFalse: [] };
    }

    const valueExpression = leftIsNull ? expression.right : expression.left;
    const operand = this.checkExpression(valueExpression, null);

    if (operand.type.kind === "Error") {
      return { ir: this.errorValue(span), whenTrue: [], whenFalse: [] };
    }

    if (operand.type.kind !== "Nullable") {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: `${typeName(operand.type)} always holds a value, so comparing it with null is not allowed`,
        span,
        label: `this is ${typeName(operand.type)}, never absent`,
        notes: [
          "null is not a value of a non-nullable type, so this test could never change anything",
          `declare it as '${typeName(operand.type)}?' if it may be absent`,
        ],
      });
      return { ir: this.errorValue(span), whenTrue: [], whenFalse: [] };
    }

    const ir: IRExpression = {
      kind: "null-test",
      operand,
      negated,
      type: BoolType,
      span,
    };

    // Only a stable binding is refined; any other operand still type-checks.
    const symbol = this.refinableSymbol(valueExpression);
    if (!symbol) return { ir, whenTrue: [], whenFalse: [] };

    const present: Refinement[] = [{ symbol, type: withoutNull(operand.type) }];
    return negated
      ? { ir, whenTrue: present, whenFalse: [] }
      : { ir, whenTrue: [], whenFalse: present };
  }

  private isNullLiteral(expression: Expression): boolean {
    if (expression.kind === "paren") return this.isNullLiteral(expression.expression);
    return expression.kind === "null";
  }

  private checkIf(expression: IfExpression, expected: KType | null): IRExpression {
    const checked = this.checkCondition(expression.condition);
    const condition = checked.ir;
    this.expect(condition, BoolType, "an `if` condition must be a Bool");

    // Refinement is lexical: it lives in a scope around the branch and is gone
    // once that scope pops, which is what makes an ordinary join restore the
    // declared nullable type.
    this.pushScope(checked.whenTrue);
    const then = this.checkBlock(expression.then, expected);
    this.scopes.pop();

    if (!expression.otherwise) {
      const produced = then.block.type.kind;
      if (produced !== "Unit" && produced !== "Never" && produced !== "Error") {
        this.diagnostics.add({
          code: Codes.TypeMismatch,
          message: "this `if` needs an `else` because it produces a value",
          span: expression.span,
          label: `the block produces ${typeName(then.block.type)}`,
          notes: ["an `if` used as a value must cover both outcomes (docs/spec/syntax.md)"],
        });
      }
      return {
        kind: "if",
        condition,
        then: then.block,
        otherwise: null,
        type: produced === "Error" ? ErrorType : UnitType,
        span: expression.span,
      };
    }

    this.pushScope(checked.whenFalse);
    const otherwise =
      expression.otherwise.kind === "if"
        ? this.wrapExpressionBlock(this.checkExpression(expression.otherwise, expected))
        : this.checkBlock(expression.otherwise, expected);
    this.scopes.pop();

    const type = unify(then.block.type, otherwise.block.type);
    if (!type) {
      this.diagnostics.add({
        code: Codes.TypeMismatch,
        message: "the two branches of this `if` produce different types",
        span: expression.span,
        label: `${typeName(then.block.type)} in one branch, ${typeName(otherwise.block.type)} in the other`,
        secondary: [
          { span: then.block.span, message: `this branch produces ${typeName(then.block.type)}` },
          { span: otherwise.block.span, message: `this branch produces ${typeName(otherwise.block.type)}` },
        ],
        notes: ["both branches of an `if` must produce the same type"],
      });
    }

    return {
      kind: "if",
      condition,
      then: then.block,
      otherwise: otherwise.block,
      type: type ?? ErrorType,
      span: expression.span,
    };
  }

  /** Wraps `else if` so both branches of an `if` are uniform blocks. */
  private wrapExpressionBlock(value: IRExpression): BlockResult {
    return {
      block: { statements: [], tail: value, type: value.type, span: value.span },
      alwaysReturns: value.type.kind === "Never",
    };
  }

  // ------------------------------------------------------------------ helpers

  private pushScope(refinements: readonly Refinement[] = []): void {
    const map = new Map<number, KType>();
    for (const refinement of refinements) map.set(refinement.symbol.id, refinement.type);
    this.scopes.push({ bindings: new Map(), refinements: map });
  }

  /** The innermost active refinement for a symbol, if any. */
  private lookupRefinement(id: number): KType | null {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const found = this.scopes[index]!.refinements.get(id);
      if (found) return found;
    }
    return null;
  }

  /**
   * ADR 0007 follow-up: only a stable binding refines - an immutable local or
   * an immutable parameter. A mutable local can be rebound, and a member
   * expression is an aliased property, so neither qualifies.
   */
  private refinableSymbol(expression: Expression): LocalSymbol | null {
    if (expression.kind === "paren") return this.refinableSymbol(expression.expression);
    if (expression.kind !== "name") return null;
    const local = this.lookupLocal(expression.name);
    if (!local || local.mutable) return null;
    return local;
  }

  private lookupLocal(name: string): LocalSymbol | null {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const found = this.scopes[index]!.bindings.get(name);
      if (found) return found;
    }
    return null;
  }

  /** Presentation integration only; cyclic/invalid data never enter shape analysis. */
  private hasResponsibility(type: KType): boolean {
    if (!this.resultDeclaration || this.diagnostics.hasErrors) return this.isResultType(type);
    return new Shapes(this.resultDeclaration.id).of(type).bears;
  }

  private expect(value: IRExpression, expected: KType, label: string): void {
    if (isAssignable(value.type, expected)) return;
    if (expected.kind === "Unit" && this.hasResponsibility(value.type)) {
      this.reportDiscardedResult(value.span, value.type);
      return;
    }
    // Using a `T?` where a `T` is wanted is the specific mistake KODA-T0002
    // names, and docs/spec/diagnostics.md prescribes what it must show.
    if (value.type.kind === "Nullable" && isAssignable(withoutNull(value.type), expected)) {
      this.unsafeNullable(value, typeName(withoutNull(value.type)));
      return;
    }
    this.mismatch(value.type, expected, value.span, label);
  }

  /** KODA-T0002: a nullable value used where a present one is required. */
  private unsafeNullable(value: IRExpression, innerName: string): void {
    const declaration = value.kind === "local" ? value.symbol : null;
    const name = declaration?.name ?? "this value";
    this.diagnostics.add({
      code: Codes.UnsafeNullable,
      message: `${declaration ? `'${name}'` : "this value"} may be absent, so it cannot be used as ${innerName} here`,
      span: value.span,
      label: `this is ${typeName(value.type)}`,
      secondary: declaration
        ? [{ span: declaration.declarationSpan, message: `'${name}' is declared ${typeName(declaration.type)}` }]
        : [],
      notes: [
        `check it first: \`if ${declaration ? name : "value"} != null { ... }\``,
        `or handle both cases: \`match ${declaration ? name : "value"} { null => ..., present => ... }\``,
        ...(declaration?.mutable
          ? ["a `mut` binding cannot be refined, because it may be rebound; bind it to an immutable name first"]
          : []),
      ],
    });
  }

  /** True for a direct `Result<T, E>`. */
  private isResultType(type: KType): boolean {
    return type.kind === "Enum" && this.resultDeclaration !== null
      && sameDeclarationId(type.declaration.id, this.resultDeclaration.id);
  }

  /**
   * ADR 0010: a Result in a position that wants nothing is a discarded Result.
   * Saying so beats "expected Unit, found Result", which describes the same
   * statement less usefully.
   */
  private reportDiscardedResult(span: Span, type: KType): void {
    this.diagnostics.add({
      code: Codes.DiscardedResult,
      message: `this ${typeName(type)} is thrown away without being looked at`,
      span,
      label: "the operation may have failed, and nothing here checks",
      notes: [
        "a Result says an operation can succeed or fail; Koda will not let the failure pass silently",
        "handle it with `match ... { Ok(value) => ..., Err(error) => ... }`",
        "or bind it, return it, or pass it to something that takes responsibility",
      ],
    });
  }

  private mismatch(actual: KType, expected: KType, span: Span, label: string): void {
    const notes =
      isNumeric(actual) && isNumeric(expected)
        ? ["Int and Float never convert on their own in Koda; convert the value explicitly (ADR 0008)"]
        : [];
    this.diagnostics.add({
      code: Codes.TypeMismatch,
      message: `expected ${typeName(expected)}, found ${typeName(actual)}`,
      span,
      label,
      notes,
    });
  }

  private duplicate(name: string, span: Span, previous: Span): void {
    this.diagnostics.add({
      code: Codes.DuplicateName,
      message: `'${name}' is already declared`,
      span,
      label: "this name is already taken",
      secondary: [{ span: previous, message: `'${name}' was first declared here` }],
      notes: ["Koda rejects shadowing and duplicate declarations so a name always means one thing (ADR 0007)"],
    });
  }

  /** A cheap "did you mean" for beginner-first name diagnostics (ADR 0010). */
  private nearestVisibleName(name: string): string | null {
    const candidates: string[] = [...this.functions.keys(), ...this.records.keys(), ...this.enums.keys()];
    for (const scope of this.scopes) candidates.push(...scope.bindings.keys());
    return nearest(name, candidates);
  }

  /** A duplicate field, variant or payload component inside one declaration. */
  private duplicateMember(name: string, what: string, span: Span, previous: Span): void {
    this.diagnostics.add({
      code: Codes.DuplicateName,
      message: `the ${what} '${name}' is declared twice`,
      span,
      label: `this ${what} repeats an earlier one`,
      secondary: [{ span: previous, message: `'${name}' was first declared here` }],
      notes: [`each ${what} may appear only once, so that every name means one thing`],
    });
  }

  /** "This type has no member called X", with a nearby spelling when useful. */
  private unknownMember(
    owner: string,
    what: string,
    name: string,
    span: Span,
    available: readonly string[],
    declarationSpan: Span,
  ): void {
    const suggestion = nearest(name, [...available]);
    const listed = available.length > 0 ? available.join(", ") : "none";
    this.diagnostics.add({
      code: Codes.UnknownMember,
      message: `'${owner}' has no ${what} called '${name}'`,
      span,
      label: `this ${what} does not exist`,
      secondary: [{ span: declarationSpan, message: `'${owner}' is declared here` }],
      notes: [
        suggestion ? `did you mean '${suggestion}'?` : `the ${what}s of '${owner}' are: ${listed}`,
      ],
      suggestions: suggestion
        ? [{ message: `use '${suggestion}'`, span, replacement: suggestion, applicability: "needs-review" }]
        : [],
    });
  }
}

/** "a" or "an", so diagnostics read as ordinary English. */
function article(word: string): string {
  return /^[AEIOU]/i.test(word) ? "an" : "a";
}

/** Closest candidate within a small edit distance, or null. */
function nearest(name: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of [...candidates].sort()) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

export function checkModule(path: string, module: Module, diagnostics: DiagnosticBag): IRModule {
  return new Checker(path, diagnostics).check(module);
}
