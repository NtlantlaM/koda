/**
 * Result must-handle analysis (ADR 0010, slice 2C).
 *
 * A post-typecheck pass over the typed IR. It runs only on programs that
 * already type-checked, so every node carries a real type and no recovery node
 * is present. IR statement order is source order, which makes the diagnostics
 * deterministic without any extra sorting.
 *
 * The language has no loops, so this is a single ordered walk rather than a
 * fixpoint. Introducing loops later will require extending it.
 *
 * What it deliberately does not build: no control-flow graph, no ownership, no
 * borrowing, no lifetimes.
 */
import { Codes } from "../diagnostics/codes.js";
import type { DiagnosticBag } from "../diagnostics/diagnostic.js";
import type { Span } from "../source/source.js";
import type { IRBlock, IRExpression, IRFunction, IRModule, IRStatement, LocalSymbol } from "../ir/ir.js";
import { typeName, type KType } from "./types.js";

/**
 * Why a responsibility is no longer outstanding. Both are discharged for the
 * purposes of a control-flow join; they are kept apart so a diagnostic can say
 * which one happened.
 */
type State =
  | { readonly kind: "outstanding"; readonly since: Span }
  | { readonly kind: "handled"; readonly at: Span }
  | { readonly kind: "transferred"; readonly at: Span; readonly to: string | null };

interface Obligation {
  readonly symbol: LocalSymbol;
  state: State;
}

/** Obligations in flight, keyed by `LocalSymbol.id` - never by name. */
type Environment = Map<number, Obligation>;

function isDischarged(state: State): boolean {
  return state.kind !== "outstanding";
}

class ObligationChecker {
  private readonly diagnostics: DiagnosticBag;
  private readonly resultId: number;

  constructor(diagnostics: DiagnosticBag, resultId: number) {
    this.diagnostics = diagnostics;
    this.resultId = resultId;
  }

  /**
   * True when a binding's **own** type is `Result<T, E>` or `Result<T, E>?`.
   *
   * Slice 2C deliberately does not look inside record fields or enum payloads;
   * see the limitation recorded in ADR 0010.
   */
  private tracks(type: KType): boolean {
    const inner = type.kind === "Nullable" ? type.inner : type;
    return inner.kind === "Enum" && inner.declaration.id === this.resultId;
  }

  /** True for a direct, non-nullable Result. */
  private isDirectResult(type: KType): boolean {
    return type.kind === "Enum" && type.declaration.id === this.resultId;
  }

  // --------------------------------------------------------------- functions

  checkFunction(fn: IRFunction): void {
    const environment: Environment = new Map();

    // ADR 0010: a Result parameter begins outstanding, so a function cannot
    // become a reusable way to swallow failure.
    const owned: LocalSymbol[] = [];
    for (const parameter of fn.symbol.parameters) {
      if (!this.tracks(parameter.type)) continue;
      environment.set(parameter.id, {
        symbol: parameter,
        state: { kind: "outstanding", since: parameter.declarationSpan },
      });
      owned.push(parameter);
    }

    this.walkBlock(fn.body, environment, owned);
  }

  // ------------------------------------------------------------------ blocks

  /**
   * Walks a block. `owned` names symbols this block is responsible for beyond
   * its own declarations - a function's parameters, or an arm's pattern
   * bindings. Returns true when the block always leaves through a `return`, in
   * which case that exit was already checked.
   */
  private walkBlock(block: IRBlock, environment: Environment, owned: readonly LocalSymbol[]): boolean {
    const declaredHere: LocalSymbol[] = [...owned];
    let diverged = false;

    for (const statement of block.statements) {
      if (this.walkStatement(statement, environment, declaredHere)) {
        diverged = true;
        break;
      }
    }

    if (!diverged && block.tail) {
      this.walkExpression(block.tail, environment);
      // A tail is the block's value, so a Result flowing out of it is handed to
      // whatever contains the block.
      this.transferIfTracked(block.tail, environment, null);
    }

    if (!diverged) this.reportOutstanding(declaredHere, environment, block.span, "scope");
    for (const symbol of declaredHere) environment.delete(symbol.id);
    return diverged;
  }

  /** Returns true when the statement ends the path. */
  private walkStatement(statement: IRStatement, environment: Environment, declaredHere: LocalSymbol[]): boolean {
    switch (statement.kind) {
      case "declare": {
        this.walkExpression(statement.value, environment);
        // Binding an outstanding Result into another name transfers it.
        this.transferIfTracked(statement.value, environment, statement.symbol.name);
        if (this.tracks(statement.symbol.type)) {
          environment.set(statement.symbol.id, {
            symbol: statement.symbol,
            state: { kind: "outstanding", since: statement.span },
          });
          declaredHere.push(statement.symbol);
        }
        return false;
      }

      case "assign": {
        this.walkExpression(statement.value, environment);
        this.transferIfTracked(statement.value, environment, statement.symbol.name);

        const existing = environment.get(statement.symbol.id);
        if (existing && existing.state.kind === "outstanding") {
          this.diagnostics.add({
            code: Codes.OverwrittenResult,
            message: `'${statement.symbol.name}' still holds an outcome nobody has looked at`,
            span: statement.span,
            label: "this replaces it before it was handled",
            secondary: [
              { span: existing.state.since, message: `'${statement.symbol.name}' was given a Result here` },
            ],
            notes: [
              "a Result says an operation may fail, so replacing one without looking at it loses that failure",
              `handle it first with \`match ${statement.symbol.name} { Ok(value) => ..., Err(error) => ... }\`, or return or pass it on`,
            ],
          });
        }
        // A discharged binding may take a new Result, starting a fresh
        // obligation for the same symbol.
        if (existing) existing.state = { kind: "outstanding", since: statement.span };
        return false;
      }

      case "return": {
        if (statement.value) {
          this.walkExpression(statement.value, environment);
          this.transferIfTracked(statement.value, environment, null);
        }
        // Every return is an exit for this path.
        const live = [...environment.values()].map((item) => item.symbol);
        this.reportOutstanding(live, environment, statement.span, "return");
        return true;
      }

      case "eval": {
        // The one shape that is a discard: a reachable expression statement
        // whose value is a Result. Every other position hands it somewhere.
        if (this.isDirectResult(statement.value.type)) this.reportDiscard(statement.value, statement.span);
        this.walkExpression(statement.value, environment);
        return statement.value.type.kind === "Never";
      }
    }
  }

  // ------------------------------------------------------------- expressions

  /**
   * Walks an expression for nested transfer sites and nested control flow.
   * Reading a name is not a transfer; only the positions below are.
   */
  private walkExpression(expression: IRExpression, environment: Environment): void {
    switch (expression.kind) {
      case "call":
        for (const argument of expression.args) {
          this.walkExpression(argument, environment);
          this.transferIfTracked(argument, environment, expression.target.name);
        }
        return;

      case "record":
        for (const entry of expression.entries) {
          this.walkExpression(entry.value, environment);
          this.transferIfTracked(entry.value, environment, entry.field.name);
        }
        return;

      case "variant":
        for (const argument of expression.args) {
          this.walkExpression(argument, environment);
          this.transferIfTracked(argument, environment, expression.variant.name);
        }
        return;

      case "if": {
        this.walkExpression(expression.condition, environment);
        const branches: Environment[] = [];

        const thenEnvironment = cloneEnvironment(environment);
        if (!this.walkBlock(expression.then, thenEnvironment, [])) branches.push(thenEnvironment);

        if (expression.otherwise) {
          const elseEnvironment = cloneEnvironment(environment);
          if (!this.walkBlock(expression.otherwise, elseEnvironment, [])) branches.push(elseEnvironment);
        } else {
          // Without an `else`, the path that skips the branch reaches the join
          // with the incoming state unchanged.
          branches.push(cloneEnvironment(environment));
        }

        mergeInto(environment, branches);
        return;
      }

      case "match": {
        this.walkExpression(expression.scrutinee, environment);
        // A match discharges only when both Result alternatives are visible.
        if (expression.declaration.id === this.resultId && exposesBothAlternatives(expression.arms)) {
          this.dischargeIfTracked(expression.scrutinee, environment, expression.span);
        }
        const branches: Environment[] = [];
        for (const arm of expression.arms) {
          const armEnvironment = cloneEnvironment(environment);
          const bound = arm.bindings.filter((binding): binding is LocalSymbol => binding !== null);
          const owned = this.registerBindings(bound, armEnvironment, arm.span);
          if (!this.walkBlock(arm.body, armEnvironment, owned)) branches.push(armEnvironment);
        }
        mergeInto(environment, branches);
        return;
      }

      case "nullable-match": {
        this.walkExpression(expression.scrutinee, environment);
        // Absence and presence are both exposed, so the outer obligation on a
        // nullable Result is discharged here.
        this.dischargeIfTracked(expression.scrutinee, environment, expression.span);
        const branches: Environment[] = [];
        for (const arm of expression.arms) {
          const armEnvironment = cloneEnvironment(environment);
          const bound = arm.binding ? [arm.binding] : [];
          const owned = this.registerBindings(bound, armEnvironment, arm.span);
          if (!this.walkBlock(arm.body, armEnvironment, owned)) branches.push(armEnvironment);
        }
        mergeInto(environment, branches);
        return;
      }

      case "int-arith":
      case "float-arith":
      case "concat":
      case "equal":
      case "compare":
      case "logical":
        this.walkExpression(expression.left, environment);
        this.walkExpression(expression.right, environment);
        return;

      case "int-negate":
      case "float-negate":
      case "not":
      case "null-test":
        this.walkExpression(expression.operand, environment);
        return;

      case "field":
        this.walkExpression(expression.target, environment);
        return;

      case "interpolate":
        for (const part of expression.parts) {
          if (part.kind === "value") this.walkExpression(part.value, environment);
        }
        return;

      default:
        return;
    }
  }

  /** A pattern binding whose own type is a Result acquires an obligation. */
  private registerBindings(
    bindings: readonly LocalSymbol[],
    environment: Environment,
    span: Span,
  ): LocalSymbol[] {
    const owned: LocalSymbol[] = [];
    for (const binding of bindings) {
      if (!this.tracks(binding.type)) continue;
      environment.set(binding.id, { symbol: binding, state: { kind: "outstanding", since: span } });
      owned.push(binding);
    }
    return owned;
  }

  /** Marks a referenced binding transferred, when it is still outstanding. */
  private transferIfTracked(expression: IRExpression, environment: Environment, to: string | null): void {
    if (expression.kind !== "local") return;
    const obligation = environment.get(expression.symbol.id);
    if (!obligation || obligation.state.kind !== "outstanding") return;
    obligation.state = { kind: "transferred", at: expression.span, to };
  }

  private dischargeIfTracked(expression: IRExpression, environment: Environment, at: Span): void {
    if (expression.kind !== "local") return;
    const obligation = environment.get(expression.symbol.id);
    if (!obligation || obligation.state.kind !== "outstanding") return;
    obligation.state = { kind: "handled", at };
  }

  // ------------------------------------------------------------ diagnostics

  private reportDiscard(value: IRExpression, span: Span): void {
    this.diagnostics.add({
      code: Codes.DiscardedResult,
      message: `this ${typeName(value.type)} is thrown away without being looked at`,
      span,
      label: "the operation may have failed, and nothing here checks",
      notes: [
        "a Result says an operation can succeed or fail; Koda will not let the failure pass silently",
        "handle it with `match ... { Ok(value) => ..., Err(error) => ... }`",
        "or bind it, return it, or pass it to something that takes responsibility",
      ],
    });
  }

  private reportOutstanding(
    candidates: readonly LocalSymbol[],
    environment: Environment,
    span: Span,
    where: "scope" | "return",
  ): void {
    // Deterministic order: symbol ids are allocated in source order.
    const outstanding = candidates
      .map((symbol) => environment.get(symbol.id))
      .filter((item): item is Obligation => item !== undefined && item.state.kind === "outstanding")
      .sort((a, b) => a.symbol.id - b.symbol.id);

    for (const obligation of outstanding) {
      const name = obligation.symbol.name;
      const since = obligation.state.kind === "outstanding" ? obligation.state.since : obligation.symbol.declarationSpan;
      this.diagnostics.add({
        code: Codes.OutstandingResult,
        message: `'${name}' still holds an outcome nobody has looked at`,
        span,
        label:
          where === "return"
            ? "this returns while that outcome is still unhandled"
            : "this is where it goes out of scope",
        secondary: [{ span: since, message: `'${name}' was given a Result here` }],
        notes: [
          "a Result says an operation can succeed or fail; Koda will not let the failure pass silently",
          `handle it with \`match ${name} { Ok(value) => ..., Err(error) => ... }\``,
          "or return it, or pass it to something that takes responsibility",
        ],
      });
      // Report each obligation once.
      obligation.state = { kind: "handled", at: span };
    }
  }
}

function cloneEnvironment(environment: Environment): Environment {
  const copy: Environment = new Map();
  for (const [id, obligation] of environment) {
    copy.set(id, { symbol: obligation.symbol, state: obligation.state });
  }
  return copy;
}

/**
 * Join: discharged on every contributing path means discharged; otherwise the
 * responsibility survives the join. A branch that cannot reach the join does
 * not contribute.
 */
function mergeInto(environment: Environment, branches: readonly Environment[]): void {
  if (branches.length === 0) return;
  for (const obligation of environment.values()) {
    if (obligation.state.kind !== "outstanding") continue;
    let discharged: State | null = null;
    for (const branch of branches) {
      const state = branch.get(obligation.symbol.id)?.state;
      if (!state || !isDischarged(state)) {
        discharged = null;
        break;
      }
      discharged = state;
    }
    if (discharged) obligation.state = discharged;
  }
}

/** Both Result alternatives named, whatever their payload patterns do. */
function exposesBothAlternatives(arms: readonly { readonly variant: { readonly name: string } | null }[]): boolean {
  let ok = false;
  let err = false;
  for (const arm of arms) {
    if (arm.variant?.name === "Ok") ok = true;
    if (arm.variant?.name === "Err") err = true;
  }
  return ok && err;
}

/**
 * Enforces ADR 0010's must-handle rule over a type-checked module.
 * Call only when ordinary checking produced no errors.
 */
export function checkObligations(module: IRModule, diagnostics: DiagnosticBag): void {
  if (module.resultDeclarationId === null) return;
  const checker = new ObligationChecker(diagnostics, module.resultDeclarationId);
  for (const fn of module.functions) checker.checkFunction(fn);
}
