/**
 * Diagnostic codes.
 *
 * docs/spec/diagnostics.md lists an initial code family and states plainly that
 * the codes are candidates, not a frozen registry: Q07 still owns the final
 * registry, rendering and exit contracts. Codes marked CANDIDATE below are not
 * in that document; they exist because this slice reports a condition the
 * accepted decisions require but the candidate table does not yet name.
 * They must be reconciled when Q07 is decided.
 */
export const Codes = {
  /** Unexpected token; docs/spec/diagnostics.md. */
  UnexpectedToken: "KODA-P0001",
  /** CANDIDATE. Malformed literal (unterminated string, bad escape, bad numeral). */
  InvalidLiteral: "KODA-P0002",
  /** Unresolved name; docs/spec/diagnostics.md. */
  UnresolvedName: "KODA-N0001",
  /** CANDIDATE. Duplicate or shadowing declaration; required by ADR 0007. */
  DuplicateName: "KODA-N0002",
  /** Type mismatch; docs/spec/diagnostics.md. */
  TypeMismatch: "KODA-T0001",
  /** Non-exhaustive match; docs/spec/diagnostics.md. */
  NonExhaustiveMatch: "KODA-T0003",
  /** Unsafe nullable access; docs/spec/diagnostics.md. */
  UnsafeNullable: "KODA-T0002",
  /** Reassignment to an immutable binding; docs/spec/diagnostics.md. */
  ImmutableAssignment: "KODA-T0004",
  /** Discarded Result-bearing expression or temporary residual; docs/spec/diagnostics.md. */
  DiscardedResult: "KODA-T0005",
  /** CANDIDATE. Wrong number of call arguments. */
  ArgumentCount: "KODA-T0006",
  /** CANDIDATE. Numeric literal cannot inhabit its selected type; required by ADR 0008. */
  NumericLiteral: "KODA-T0007",
  /** CANDIDATE. Record construction does not supply every field exactly once. */
  IncompleteRecord: "KODA-T0008",
  /** CANDIDATE. A type has no field, or an enum no variant, with that name. */
  UnknownMember: "KODA-T0009",
  /** CANDIDATE. A match arm can never be reached. */
  UnreachableArm: "KODA-T0010",
  /** CANDIDATE. Wrong number of type arguments, including an unapplied generic. */
  TypeArgumentCount: "KODA-T0011",
  /** CANDIDATE. An outstanding structural responsibility leaves scope unhandled. */
  OutstandingResult: "KODA-T0012",
  /** CANDIDATE. An old-generation structural responsibility is overwritten. */
  OverwrittenResult: "KODA-T0013",
  /** Module resolution failure; docs/spec/diagnostics.md. */
  ModuleResolution: "KODA-M0001",
  /** Unsupported feature; docs/spec/diagnostics.md. */
  Unsupported: "KODA-U0001",
  /** Compiler internal failure; docs/spec/diagnostics.md. */
  Internal: "KODA-I0001",
} as const;

export type DiagnosticCode = (typeof Codes)[keyof typeof Codes];
