/**
 * The Koda runtime for generated programs.
 *
 * docs/architecture/compiler.md limits this file to behaviour Koda semantics
 * require: no framework, no ORM, no AI dependency. Everything here exists
 * because ADR 0008 makes Int checked signed 64-bit arithmetic with
 * source-located faults on every backend, and because Koda's numeric text is
 * locale independent rather than inherited from JavaScript defaults.
 *
 * Int is represented as BigInt and Float as a JavaScript number. That choice is
 * an implementation decision this slice had to make while Q08 is unresolved;
 * see docs/implementation/slice-0.md.
 */

const INT_MIN = -(2n ** 63n);
const INT_MAX = 2n ** 63n - 1n;

/**
 * A checked arithmetic fault. ADR 0008 makes these fatal rather than Result
 * values, and ADR 0010 confirms they are not automatically turned into Result.
 */
export class KodaFault extends Error {
  /**
   * @param {string} summary what happened
   * @param {string} location "file:line:column" in the .ko source
   * @param {string} explanation why Koda stopped, in ordinary language
   */
  constructor(summary, location, explanation) {
    super(`${summary} at ${location}`);
    this.name = "KodaFault";
    this.summary = summary;
    this.location = location;
    this.explanation = explanation;
  }
}

/**
 * @param {bigint} value
 * @param {string} location
 * @param {string} operation
 * @returns {bigint}
 */
function checkRange(value, location, operation) {
  if (value < INT_MIN || value > INT_MAX) {
    throw new KodaFault(
      `${operation} produced a number outside Int's range`,
      location,
      `Int holds whole numbers from ${INT_MIN} through ${INT_MAX}. The result was ${value}, which does not fit, so Koda stopped instead of silently wrapping around.`,
    );
  }
  return value;
}

/** @param {bigint} a @param {bigint} b @param {string} location @returns {bigint} */
export function iadd(a, b, location) {
  return checkRange(a + b, location, "this addition");
}

/** @param {bigint} a @param {bigint} b @param {string} location @returns {bigint} */
export function isub(a, b, location) {
  return checkRange(a - b, location, "this subtraction");
}

/** @param {bigint} a @param {bigint} b @param {string} location @returns {bigint} */
export function imul(a, b, location) {
  return checkRange(a * b, location, "this multiplication");
}

/**
 * Integer division truncates toward zero (ADR 0008).
 * @param {bigint} a @param {bigint} b @param {string} location @returns {bigint}
 */
export function idiv(a, b, location) {
  if (b === 0n) {
    throw new KodaFault(
      "this division divides by zero",
      location,
      "Dividing a whole number by zero has no answer, so Koda stopped here. Check the divisor before dividing.",
    );
  }
  return checkRange(a / b, location, "this division");
}

/**
 * Remainder takes the dividend's sign. ADR 0008 fixes minimum Int remainder -1
 * as zero, even though the matching quotient would overflow.
 * @param {bigint} a @param {bigint} b @param {string} location @returns {bigint}
 */
export function irem(a, b, location) {
  if (b === 0n) {
    throw new KodaFault(
      "this remainder divides by zero",
      location,
      "Taking a remainder by zero has no answer, so Koda stopped here. Check the divisor before dividing.",
    );
  }
  return a % b;
}

/** @param {bigint} a @param {string} location @returns {bigint} */
export function ineg(a, location) {
  return checkRange(-a, location, "this negation");
}

/**
 * Canonical, locale-independent base-10 Int text (ADR 0008 S19).
 * @param {bigint} value @returns {string}
 */
export function itext(value) {
  return value.toString();
}

/**
 * Canonical Float text: shortest round-trip, negative zero preserved, and an
 * integral value keeps a Float marker so it is not mistaken for an Int
 * (ADR 0008 S19).
 *
 * These are canonical *output* spellings only. Special Float values have no
 * literal syntax in Koda (ADR 0008 S07 exposes them as named values whose
 * spelling is deferred), so nothing here can be written in a source program.
 * The tokens themselves remain provisional; see docs/implementation/slice-0.md.
 * @param {number} value @returns {string}
 */
export function ftext(value) {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  if (Object.is(value, -0)) return "-0.0";
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

/**
 * `print` from "koda:io": writes a String followed by a newline, returns Unit.
 * @param {string} value @returns {void}
 */
export function print(value) {
  process.stdout.write(`${value}\n`);
}

/**
 * Runs the entry function. docs/spec/language.md requires a runtime entry
 * failure to produce a diagnostic and a nonzero process exit, and forbids
 * reporting success after a fatal failure.
 *
 * The exit code itself is provisional: Q07 owns the exit contract.
 * @param {() => void} main
 * @returns {void}
 */
export function runEntry(main) {
  try {
    main();
  } catch (error) {
    if (error instanceof KodaFault) {
      process.stderr.write(`error: ${error.summary}\n`);
      process.stderr.write(`  --> ${error.location}\n`);
      process.stderr.write(`note: ${error.explanation}\n`);
    } else {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write("error[KODA-I0001]: the Koda runtime failed unexpectedly\n");
      process.stderr.write("note: this is a compiler or runtime defect, not a mistake in your program\n");
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
  }
}
