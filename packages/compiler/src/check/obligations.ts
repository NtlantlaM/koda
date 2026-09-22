/** Slice 3B: local structural responsibility, independent of runtime readability. */
import { Codes, type DiagnosticCode } from "../diagnostics/codes.js";
import type { DiagnosticBag } from "../diagnostics/diagnostic.js";
import type { Span } from "../source/source.js";
import type { IRBlock, IRExpression, IRFunction, IRModule, IRStatement, LocalSymbol } from "../ir/ir.js";
import { BoolType, UnitType, sameDeclarationId, type DeclarationId, type KType } from "./types.js";
import { ELEMENT_KEY, Shapes, fieldKey, payloadKey, variantKey, type Shape } from "./obligation-shapes.js";

type State = "outstanding" | "handled" | "transferred";
interface Node {
  readonly shape: Shape;
  state: State;
  readonly children: Map<string, Node>;
  possible: Set<string>;
  since: Span;
  truth?: boolean;
}
interface Root {
  readonly key: string;
  readonly name: string;
  readonly generation: number;
  readonly temporary: boolean;
  readonly site: Span;
  node: Node;
}
type Environment = Map<string, Root>;
interface Value { readonly root: string; readonly path: readonly string[]; readonly type: KType }
interface Flow { readonly env: Environment; readonly value: Value }
interface Condition { readonly yes: Environment[]; readonly no: Environment[] }

/**
 * True when a responsibility exists only because a type parameter might carry
 * one (Slice 4A). The wording must not assert that an outcome is present, and
 * must never tell the user to match a value whose type is abstract.
 */
function abstractResponsibility(type: KType): boolean {
  if (type.kind === "TypeParameter") return true;
  return type.kind === "Nullable" && abstractResponsibility(type.inner);
}

function fresh(shape: Shape, since: Span): Node {
  return { shape, state: "outstanding", since, possible: new Set(shape.alternatives), children: new Map([...shape.children].map(([key, member]) => [key, fresh(member.shape, since)])) };
}
function copy(node: Node, renew = false, since = node.since): Node {
  return { ...node, since: renew ? since : node.since, state: renew ? "outstanding" : node.state,
    possible: new Set(node.possible), children: new Map([...node.children].map(([key, child]) => [key, copy(child, renew, since)])) };
}
function clone(env: Environment): Environment {
  return new Map([...env].map(([key, root]) => [key, { ...root, node: copy(root.node) }]));
}
function active(node: Node, key: string): boolean {
  if (node.shape.kind === "nullable") return node.possible.has("present");
  if (node.shape.kind === "enum") return node.possible.has(key.split(":")[0]!);
  return true;
}
function mark(node: Node, state: State): void {
  if (node.state === "outstanding") node.state = state;
  for (const [key, child] of node.children) if (active(node, key)) mark(child, state);
}

class ObligationChecker {
  private readonly shapes: Shapes;
  private temporaryId = 0;
  private readonly reported = new Set<string>();
  private readonly shapeIds = new Map<Shape, number>();
  constructor(private readonly diagnostics: DiagnosticBag, private readonly resultId: DeclarationId, listId: DeclarationId | null) { this.shapes = new Shapes(resultId, listId); }
  private localKey(symbol: LocalSymbol): string { return "local:" + symbol.id; }
  /** Coalesce only identical continuations; differing presence/state correlations survive. */
  private compact(envs: Environment[]): Environment[] {
    const seen = new Set<string>();
    const encode = (node: Node): unknown => {
      if (!this.shapeIds.has(node.shape)) this.shapeIds.set(node.shape, this.shapeIds.size);
      return [this.shapeIds.get(node.shape), node.state, node.possible.size ? [...node.possible].sort() : [],
        node.truth, node.since, [...node.children].map(([key, child]) => [key, encode(child)])];
    };
    return envs.filter(env => {
      const key = JSON.stringify([...env].map(([key, root]) => [key, root.generation, root.site, encode(root.node)]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  private node(env: Environment, value: Value): Node {
    let node = env.get(value.root)!.node;
    for (const key of value.path) node = node.children.get(key)!;
    return node;
  }
  private temp(env: Environment, node: Node, site: Span): Value {
    const key = "temporary:" + this.temporaryId++;
    env.set(key, { key, name: "this temporary", generation: 0, temporary: true, site, node });
    return { root: key, path: [], type: node.shape.type };
  }
  private unknown(env: Environment, type: KType, site: Span): Value { return this.temp(env, fresh(this.shapes.of(type), site), site); }
  private transfer(env: Environment, value: Value): void { mark(this.node(env, value), "transferred"); }
  /** Snapshot receipt renews responsibility; source sharing remains unobservable. */
  private receive(env: Environment, value: Value, type: KType, since: Span): Node {
    const source = this.node(env, value);
    let received = copy(source, true, since);
    if (type.kind === "Nullable" && source.shape.kind !== "nullable") {
      received = fresh(this.shapes.of(type), since);
      received.possible = new Set(["present"]);
      received.children.set("present", copy(source, true, since));
    }
    this.transfer(env, value);
    return received;
  }
  /** Carrier for a block value; transport is not a second receiver/discard. */
  private transport(env: Environment, value: Value, site: Span): Value {
    const node = copy(this.node(env, value));
    this.transfer(env, value);
    return this.temp(env, node, site);
  }
  private bind(env: Environment, symbol: LocalSymbol, value: Value, since: Span): void {
    const key = this.localKey(symbol), previous = env.get(key);
    const received = this.receive(env, value, symbol.type, since);
    if (previous) this.reportRoot(previous, Codes.OverwrittenResult, since);
    env.set(key, { key, name: symbol.name, generation: previous ? previous.generation + 1 : 0, temporary: false, site: since, node: received });
  }
  private reportRoot(root: Root, code: DiagnosticCode, at: Span, prefix: readonly string[] = []): void {
    const visit = (node: Node, path: string[], label: string): void => {
      if (node.shape.acknowledgment && node.state === "outstanding") {
        const identity = (root.temporary ? "temp:" + root.site.start + ":" + root.site.end : root.key + ":" + root.generation) + ":" + path.join("/") + ":" + node.since.start;
        if (!this.reported.has(identity)) {
          this.reported.add(identity);
          this.diagnostics.add({ code, span: at,
            // An abstract type parameter may hold an outcome; the concrete
            // cases know that one is there (Slice 4A, ADR 0010).
            message: abstractResponsibility(node.shape.type)
              ? code === Codes.DiscardedResult
                ? label + " is discarded, and it may hold an outcome that needs handling"
                : code === Codes.OverwrittenResult
                  ? "this replaces '" + root.name + "', and '" + label + "' may hold an unhandled outcome"
                  : "'" + label + "' may hold an outcome, and nothing here hands it on"
              : code === Codes.DiscardedResult
                ? label + " is discarded while it still carries an unhandled outcome"
                : code === Codes.OverwrittenResult
                  ? "this replaces '" + root.name + "' while '" + label + "' is still unhandled"
                  : "'" + label + "' still holds an outcome nobody has looked at",
            label: code === Codes.OverwrittenResult ? "handle or transfer the old responsibility before replacing it" : "this responsibility cannot be abandoned",
            secondary: [{ span: node.since, message: label + " acquired responsibility here" }],
            // An abstract type parameter cannot be matched, so it must never be
            // told to match (Slice 4A, ADR 0010).
            notes: abstractResponsibility(node.shape.type)
              ? [label + " has an unconstrained generic type, so Koda cannot tell whether it holds an outcome that needs handling",
                 "return it, or pass it to something that takes responsibility",
                 "a value of an unconstrained type parameter cannot be matched here, because this function does not know what it is"]
              : ["match the Result with explicit Ok and Err alternatives, or return or pass responsibility onward", "wildcards do not acknowledge Results nested inside payloads; transfer does not make values unreadable"],
          });
        }
        // An outer outstanding stage subsumes its hidden descendants in a report.
        mark(node, "handled");
        return;
      }
      for (const [key, child] of node.children) if (active(node, key)) visit(child, [...path, key], label + node.shape.children.get(key)!.label);
    };
    visit(root.node, [...prefix], root.name);
  }
  private cleanTemps(env: Environment, before: ReadonlySet<string>, at: Span, keep?: string): void {
    for (const [key, root] of env) if (root.temporary && !before.has(key) && key !== keep) {
      this.reportRoot(root, Codes.DiscardedResult, at);
      env.delete(key);
    }
  }
  checkFunction(fn: IRFunction): void {
    const env: Environment = new Map();
    for (const p of fn.symbol.parameters) {
      const key = this.localKey(p);
      env.set(key, { key, name: p.name, generation: 0, temporary: false, site: p.declarationSpan, node: fresh(this.shapes.of(p.type), p.declarationSpan) });
    }
    for (const flow of this.block(fn.body, env, fn.symbol.parameters)) {
      this.transfer(flow.env, flow.value);
      this.cleanTemps(flow.env, new Set(), fn.body.span);
    }
  }
  private block(block: IRBlock, incoming: Environment, owned: readonly LocalSymbol[] = []): Flow[] {
    const keys = new Set(owned.map(s => this.localKey(s)));
    for (const s of block.statements) if (s.kind === "declare") keys.add(this.localKey(s.symbol));
    let envs = [incoming];
    for (const statement of block.statements) envs = this.compact(envs.flatMap(env => this.statement(statement, env)));
    return envs.flatMap(env => {
      const before = new Set(env.keys());
      const flows = block.tail ? this.expression(block.tail, env) : [{ env, value: this.unknown(env, UnitType, block.span) }];
      return flows.map(flow => {
        const value = this.transport(flow.env, flow.value, block.tail?.span ?? block.span);
        for (const key of keys) {
          const root = flow.env.get(key);
          if (root) { this.reportRoot(root, Codes.OutstandingResult, block.span); flow.env.delete(key); }
        }
        this.cleanTemps(flow.env, before, block.tail?.span ?? block.span, value.root);
        return { env: flow.env, value };
      });
    });
  }
  private statement(statement: IRStatement, env: Environment): Environment[] {
    const before = new Set(env.keys());
    if (statement.kind === "return") {
      const flows = statement.value ? this.expression(statement.value, env) : [{ env, value: this.unknown(env, UnitType, statement.span) }];
      for (const flow of flows) {
        this.transfer(flow.env, flow.value);
        for (const root of flow.env.values()) this.reportRoot(root, root.temporary ? Codes.DiscardedResult : Codes.OutstandingResult, statement.span);
      }
      return [];
    }
    if (statement.kind === "for") {
      // Slice 5, ADR 0010 R1/R3. The iterable is read but NOT consumed before
      // the body runs, so a `return` inside still sees it outstanding (R3).
      // Only flows that reach the end of the body are normal completion, and
      // only those discharge the collective element responsibility (R1).
      return this.expression(statement.iterable, env).flatMap(flow => {
        const collection = this.node(flow.env, flow.value);
        const element = collection.children.get(ELEMENT_KEY);
        const key = this.localKey(statement.binding);

        // Each visited element is a renewed responsibility on the binding.
        const bound = element
          ? copy(element, true, statement.span)
          : fresh(this.shapes.of(statement.binding.type), statement.span);
        flow.env.set(key, {
          key,
          name: statement.binding.name,
          generation: 0,
          temporary: false,
          site: statement.span,
          node: bound,
        });

        const completions = this.block(statement.body, flow.env, [statement.binding]);
        return completions.map(body => {
          // Normal completion visited every element, so the collection's own
          // element responsibility is discharged here and nowhere else.
          const reached = this.node(body.env, flow.value);
          const visited = reached.children.get(ELEMENT_KEY);
          if (visited) mark(visited, "transferred");
          this.cleanTemps(body.env, before, statement.span);
          return body.env;
        });
      });
    }

    return this.expression(statement.value, env).map(flow => {
      if (statement.kind === "declare" || statement.kind === "assign") this.bind(flow.env, statement.symbol, flow.value, statement.span);
      else {
        const source = this.node(flow.env, flow.value);
        // Report a discarded projection rather than every sibling on a named root.
        const root = flow.env.get(flow.value.root)!;
        this.reportRoot({ ...root, node: source, name: root.name + flow.value.path.map((_, i) => {
          let parent = root.node; for (const key of flow.value.path.slice(0, i)) parent = parent.children.get(key)!;
          return parent.shape.children.get(flow.value.path[i]!)!.label;
        }).join("") }, Codes.DiscardedResult, statement.span, flow.value.path);
      }
      this.cleanTemps(flow.env, before, statement.span);
      return flow.env;
    });
  }
  private condition(expression: IRExpression, env: Environment): Condition {
    if (expression.kind === "not") { const c = this.condition(expression.operand, env); return { yes: c.no, no: c.yes }; }
    if (expression.kind === "logical") {
      const left = this.condition(expression.left, env);
      const right = (expression.operator === "&&" ? left.yes : left.no).map(e => this.condition(expression.right, e));
      return expression.operator === "&&"
        ? { yes: right.flatMap(r => r.yes), no: [...left.no, ...right.flatMap(r => r.no)] }
        : { yes: [...left.yes, ...right.flatMap(r => r.yes)], no: right.flatMap(r => r.no) };
    }
    const yes: Environment[] = [], no: Environment[] = [];
    for (const flow of this.expression(expression, env)) {
      const truth = this.node(flow.env, flow.value).truth;
      if (truth !== false) yes.push(clone(flow.env));
      if (truth !== true) no.push(clone(flow.env));
    }
    return { yes, no };
  }
  private expression(expression: IRExpression, env: Environment): Flow[] {
    switch (expression.kind) {
      case "local": {
        const root = this.localKey(expression.symbol), path: string[] = [];
        if (env.get(root)!.node.shape.kind === "nullable" && expression.type.kind !== "Nullable") path.push("present");
        return [{ env, value: { root, path, type: expression.type } }];
      }
      case "field": return this.expression(expression.target, env).map(flow => ({ env: flow.env, value: { root: flow.value.root, path: [...flow.value.path, fieldKey(expression.field.index)], type: expression.type } }));
      case "if": {
        const c = this.condition(expression.condition, env);
        return this.conform([...c.yes.flatMap(e => this.block(expression.then, e)), ...c.no.flatMap(e => expression.otherwise ? this.block(expression.otherwise, e) : [{ env: e, value: this.unknown(e, UnitType, expression.span) }])], expression.type, expression.span);
      }
      case "logical": {
        const c = this.condition(expression, env);
        return [...c.yes.map(e => this.boolean(e, true, expression.span)), ...c.no.map(e => this.boolean(e, false, expression.span))];
      }
      case "call": {
        let pending: { env: Environment; arguments: Value[] }[] = [{ env, arguments: [] }];
        for (const arg of expression.args) pending = pending.flatMap(p => this.expression(arg, p.env).map(flow => {
          const value = this.temp(flow.env, this.receive(flow.env, flow.value, arg.type, arg.span), arg.span);
          return { env: flow.env, arguments: [...p.arguments, value] };
        }));
        return pending.map(p => { for (const argument of p.arguments) this.transfer(p.env, argument); return { env: p.env, value: this.unknown(p.env, expression.type, expression.span) }; });
      }
      case "list": {
        // Elements evaluate left to right and transfer into the new list, the
        // same way record entries do. The collective element node then stands
        // for all of them.
        let pending: { env: Environment; values: Value[] }[] = [{ env, values: [] }];
        for (const element of expression.elements) pending = pending.flatMap(p => this.expression(element, p.env).map(flow => ({
          env: flow.env,
          values: [...p.values, flow.value],
        })));
        return pending.map(p => {
          for (const value of p.values) this.transfer(p.env, value);
          const node = fresh(this.shapes.of(expression.type), expression.span);
          return { env: p.env, value: this.temp(p.env, node, expression.span) };
        });
      }

      case "string-op": {
        // Slice 6B: a String, Bool, Int and String? all bear nothing, so these
        // only need their operands walked for nested control flow.
        let flows = this.expression(expression.target, env);
        if (expression.argument) {
          flows = flows.flatMap(flow => this.expression(expression.argument!, flow.env));
        }
        return flows.map(flow => ({ env: flow.env, value: this.unknown(flow.env, expression.type, expression.span) }));
      }

      case "list-op": {
        // Observers (`length`, `isEmpty`, `get`) read the receiver without
        // accounting for it, so the collection stays responsible for every
        // element it holds (ADR 0010 R2). `append` is the one producer: it
        // accounts for the receiver and the value, and its result carries
        // both (Slice 6A). That is the ordinary read-and-renew rule, not a
        // move - re-reading the original renews it again.
        const produces = expression.operation === "append";
        let flows = this.expression(expression.target, env);
        if (expression.index) {
          flows = flows.flatMap(flow => this.expression(expression.index!, flow.env).map(next => {
            if (produces) this.transfer(next.env, next.value);
            return { env: next.env, value: flow.value };
          }));
        }
        return flows.map(flow => {
          if (produces) this.transfer(flow.env, flow.value);
          return { env: flow.env, value: this.unknown(flow.env, expression.type, expression.span) };
        });
      }

      case "record": case "variant": {
        const node = fresh(this.shapes.of(expression.type), expression.span);
        mark(node, "handled"); // Members acquire responsibility only as evaluated.
        if (expression.kind === "variant") node.possible = new Set([variantKey(expression.variant.index)]);
        const result = this.temp(env, node, expression.span);
        let flows = [{ env, value: result }];
        const entries = expression.kind === "record"
          ? expression.entries.map(entry => ({ key: fieldKey(entry.field.index), value: entry.value }))
          : expression.args.map((value, index) => ({ key: payloadKey(expression.variant.index, index), value }));
        for (const entry of entries) flows = flows.flatMap(p => this.expression(entry.value, p.env).map(flow => {
          const destination = this.node(flow.env, result);
          destination.children.set(entry.key, this.receive(flow.env, flow.value, destination.shape.children.get(entry.key)!.shape.type, entry.value.span));
          return { env: flow.env, value: result };
        }));
        for (const flow of flows) this.node(flow.env, result).state = "outstanding";
        return flows;
      }
      case "match": case "nullable-match": return this.match(expression, env);
      case "bool": return [this.boolean(env, expression.value, expression.span)];
      case "null": {
        const value = this.unknown(env, expression.type, expression.span);
        this.node(env, value).possible = new Set(["null"]);
        return [{ env, value }];
      }
      default: {
        const children: IRExpression[] = [];
        if ("left" in expression) children.push(expression.left, expression.right);
        else if ("operand" in expression) children.push(expression.operand);
        else if (expression.kind === "interpolate") for (const part of expression.parts) if (part.kind === "value") children.push(part.value);
        let envs = [env];
        for (const child of children) envs = envs.flatMap(e => this.expression(child, e).map(f => f.env));
        return envs.map(e => ({ env: e, value: this.unknown(e, expression.type, expression.span) }));
      }
    }
  }
  private boolean(env: Environment, truth: boolean, span: Span): Flow {
    const value = this.unknown(env, BoolType, span); this.node(env, value).truth = truth;
    return { env, value };
  }
  /** Preserve the nullable injection of branch values without renewing children. */
  private conform(flows: Flow[], type: KType, site: Span): Flow[] {
    return flows.map(flow => {
      const node = this.node(flow.env, flow.value);
      if (type.kind !== "Nullable" || node.shape.kind === "nullable") return flow;
      const wrapper = fresh(this.shapes.of(type), site);
      wrapper.possible = new Set(["present"]);
      wrapper.children.set("present", copy(node));
      this.transfer(flow.env, flow.value);
      return { env: flow.env, value: this.temp(flow.env, wrapper, site) };
    });
  }
  /** Refine alternatives, transfer only bound subtrees, and retain wildcard residuals. */
  private match(expression: Extract<IRExpression, { kind: "match" | "nullable-match" }>, env: Environment): Flow[] {
    const sources = this.conform(this.expression(expression.scrutinee, env), expression.scrutinee.type, expression.scrutinee.span);
    const flows = sources.flatMap(source => {
      const node = this.node(source.env, source.value);
      if (expression.kind === "nullable-match") {
        if (expression.arms.some(a => a.test === "null") && expression.arms.some(a => a.test === "catch-all")) node.state = "handled";
        const remaining = new Set(node.possible);
        return expression.arms.flatMap(arm => {
          const allowed = arm.test === "null" ? [...remaining].filter(k => k === "null") : [...remaining];
          for (const key of allowed) remaining.delete(key);
          if (!allowed.length) return [];
          const branch = clone(source.env);
          this.node(branch, source.value).possible = new Set(allowed);
          if (arm.binding) {
            const value = arm.binding.type.kind === "Nullable" ? source.value : {
              root: source.value.root, path: [...source.value.path, "present"], type: arm.binding.type,
            };
            this.bind(branch, arm.binding, value, arm.span);
          }
          return this.block(arm.body, branch, arm.binding ? [arm.binding] : []);
        });
      }
      if (sameDeclarationId(expression.declaration.id, this.resultId) && expression.arms.some(a => a.variant?.name === "Ok") && expression.arms.some(a => a.variant?.name === "Err")) node.state = "handled";
      const remaining = new Set(node.possible);
      return expression.arms.flatMap(arm => {
        const allowed = arm.variant ? [...remaining].filter(k => k === variantKey(arm.variant!.index)) : [...remaining];
        for (const key of allowed) remaining.delete(key);
        if (!allowed.length) return [];
        const branch = clone(source.env);
        this.node(branch, source.value).possible = new Set(allowed);
        const owned: LocalSymbol[] = [];
        for (const [index, binding] of arm.bindings.entries()) if (binding && arm.variant) {
          this.bind(branch, binding, { root: source.value.root, path: [...source.value.path, payloadKey(arm.variant.index, index)], type: binding.type }, arm.span);
          owned.push(binding);
        }
        return this.block(arm.body, branch, owned);
      });
    });
    return this.conform(flows, expression.type, expression.span);
  }

}

export function checkObligations(module: IRModule, diagnostics: DiagnosticBag): void {
  if (module.resultDeclarationId === null) return;
  const checker = new ObligationChecker(diagnostics, module.resultDeclarationId, module.listDeclarationId);
  for (const fn of module.functions) checker.checkFunction(fn);
}
