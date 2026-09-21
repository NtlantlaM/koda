/**
 * Exact numeral handling for ADR 0008 (docs/spec/numbers.md).
 *
 * The rules implemented here:
 *   - S15: the exact source numeral is preserved until its expected or default
 *     type is selected. Nothing here rounds before a target type is known.
 *   - Integer numerals default to Int; decimal-point/exponent numerals default
 *     to Float.
 *   - Retargeting a literal must be exact. An integer numeral expected as Float
 *     must be exactly representable; a Float numeral expected as Int must be
 *     integral and in range.
 *   - S10: a directly negated numeral is range-checked as a signed
 *     mathematical value, so -9223372036854775808 is a valid Int while its
 *     positive magnitude is not.
 *   - S06: a finite Float numeral that overflows rounds to signed infinity, and
 *     one that underflows produces a correctly signed zero. Neither is an error.
 */

export const INT_MIN = -(2n ** 63n);
export const INT_MAX = 2n ** 63n - 1n;

/** Why a numeral cannot inhabit the type its context selected. */
export type NumeralRejection =
  | { readonly kind: "int-range" }
  | { readonly kind: "not-integral" }
  | { readonly kind: "inexact-as-float" }
  | { readonly kind: "negative-zero-as-int" }
  | { readonly kind: "malformed" };

export type NumeralResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: NumeralRejection };

function stripSeparators(raw: string): string {
  return raw.replaceAll("_", "");
}

/** Exact magnitude of an integer numeral in any accepted base. */
export function integerMagnitude(raw: string): bigint | null {
  const text = stripSeparators(raw);
  try {
    if (/^0[bB]/.test(text)) return BigInt(`0b${text.slice(2)}`);
    if (/^0[oO]/.test(text)) return BigInt(`0o${text.slice(2)}`);
    if (/^0[xX]/.test(text)) return BigInt(`0x${text.slice(2)}`);
    if (!/^[0-9]+$/.test(text)) return null;
    // A leading zero never implies octal (ADR 0008 S09).
    return BigInt(text);
  } catch {
    return null;
  }
}

/**
 * Exact value of a decimal Float numeral as `mantissa * 10 ** exponent`.
 * No binary rounding happens here.
 */
export function decimalParts(raw: string): { mantissa: bigint; exponent: number } | null {
  const text = stripSeparators(raw);
  const match = /^([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$/.exec(text);
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  const exponent = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (whole === "" && fraction === "") return null;
  const digits = `${whole}${fraction}`;
  return { mantissa: BigInt(digits === "" ? "0" : digits), exponent: exponent - fraction.length };
}

/** Exact integer value of a numeral, or null when it is not an integer. */
function exactInteger(raw: string, category: "int" | "float"): bigint | null {
  if (category === "int") return integerMagnitude(raw);
  const parts = decimalParts(raw);
  if (!parts) return null;
  if (parts.exponent >= 0) return parts.mantissa * 10n ** BigInt(parts.exponent);
  const divisor = 10n ** BigInt(-parts.exponent);
  if (parts.mantissa % divisor !== 0n) return null;
  return parts.mantissa / divisor;
}

/** Selects an Int value for a numeral, applying a direct negation if present. */
export function numeralAsInt(raw: string, category: "int" | "float", negated: boolean): NumeralResult<bigint> {
  const magnitude = exactInteger(raw, category);
  if (magnitude === null) {
    // Distinguish "1.5 is not an integer" from a malformed numeral.
    const reason: NumeralRejection =
      category === "float" && decimalParts(raw) !== null ? { kind: "not-integral" } : { kind: "malformed" };
    return { ok: false, reason };
  }
  // A negative floating zero cannot be retargeted to Int: that loses its sign.
  if (category === "float" && negated && magnitude === 0n) {
    return { ok: false, reason: { kind: "negative-zero-as-int" } };
  }
  const value = negated ? -magnitude : magnitude;
  if (value < INT_MIN || value > INT_MAX) return { ok: false, reason: { kind: "int-range" } };
  return { ok: true, value };
}

/** True when a mathematical integer is exactly representable in binary64. */
export function isExactlyRepresentableAsFloat(value: bigint): boolean {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return false;
  return BigInt(asNumber) === value;
}

/**
 * Selects a Float value for a numeral.
 *
 * An integer numeral must convert exactly; a decimal numeral uses correctly
 * rounded binary64 parsing, which JavaScript's own string conversion performs
 * with nearest/ties-to-even, including overflow to infinity and gradual
 * underflow to a signed zero.
 */
export function numeralAsFloat(raw: string, category: "int" | "float", negated: boolean): NumeralResult<number> {
  if (category === "int") {
    const magnitude = integerMagnitude(raw);
    if (magnitude === null) return { ok: false, reason: { kind: "malformed" } };
    if (!isExactlyRepresentableAsFloat(magnitude)) {
      return { ok: false, reason: { kind: "inexact-as-float" } };
    }
    const value = Number(magnitude);
    return { ok: true, value: negated ? -value : value };
  }

  if (decimalParts(raw) === null) return { ok: false, reason: { kind: "malformed" } };
  const value = Number(stripSeparators(raw));
  if (Number.isNaN(value)) return { ok: false, reason: { kind: "malformed" } };
  return { ok: true, value: negated ? -value : value };
}

/** Whether a nonzero numeral underflowed to zero; ADR 0008 S06 allows a warning. */
export function underflowedToZero(raw: string, value: number): boolean {
  if (value !== 0) return false;
  const parts = decimalParts(raw);
  return parts !== null && parts.mantissa !== 0n;
}
