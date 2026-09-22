/**
 * Unit tests for the two pieces the rest of the compiler trusts blindly:
 * exact numeral handling (ADR 0008) and UTF-8 span arithmetic
 * (docs/spec/diagnostics.md).
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  INT_MAX,
  INT_MIN,
  decimalParts,
  integerMagnitude,
  isExactlyRepresentableAsFloat,
  numeralAsFloat,
  numeralAsInt,
  underflowedToZero,
} from "../src/numeric/literals.js";
import { SourceFile } from "../src/source/source.js";

describe("numeral magnitudes", () => {
  test("reads every accepted base and ignores separators", () => {
    assert.equal(integerMagnitude("255"), 255n);
    assert.equal(integerMagnitude("0xFF"), 255n);
    assert.equal(integerMagnitude("0b1010"), 10n);
    assert.equal(integerMagnitude("0o755"), 493n);
    assert.equal(integerMagnitude("1_000_000"), 1000000n);
    // A leading zero is not octal.
    assert.equal(integerMagnitude("0755"), 755n);
  });

  test("keeps decimal numerals exact before any rounding", () => {
    assert.deepEqual(decimalParts("1.5"), { mantissa: "15", exponent: -1n });
    assert.deepEqual(decimalParts("2e3"), { mantissa: "2", exponent: 3n });
    assert.deepEqual(decimalParts("1.25e-2"), { mantissa: "125", exponent: -4n });
  });
});

describe("Int selection", () => {
  test("accepts the signed minimum only when it is directly negated", () => {
    assert.deepEqual(numeralAsInt("9223372036854775808", "int", true), { ok: true, value: INT_MIN });
    assert.equal(numeralAsInt("9223372036854775808", "int", false).ok, false);
    assert.deepEqual(numeralAsInt("9223372036854775807", "int", false), { ok: true, value: INT_MAX });
  });

  test("retargets a decimal numeral only when it is a whole number", () => {
    assert.deepEqual(numeralAsInt("1.0", "float", false), { ok: true, value: 1n });
    assert.equal(numeralAsInt("1.5", "float", false).ok, false);
    assert.deepEqual(numeralAsInt("2e3", "float", false), { ok: true, value: 2000n });
  });

  test("refuses negative zero, which Int cannot keep", () => {
    const result = numeralAsInt("0.0", "float", true);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason.kind, "negative-zero-as-int");
  });
});

describe("Float selection", () => {
  test("requires an integer numeral to be exactly representable", () => {
    assert.equal(numeralAsFloat("9007199254740992", "int", false).ok, true);
    assert.equal(numeralAsFloat("9007199254740993", "int", false).ok, false);
    // 2^63 is exact even though it is not a valid default Int.
    assert.equal(numeralAsFloat("9223372036854775808", "int", false).ok, true);
    assert.equal(isExactlyRepresentableAsFloat(INT_MIN), true);
  });

  test("rounds decimals, overflows to signed infinity and underflows to zero", () => {
    assert.deepEqual(numeralAsFloat("0.1", "float", false), { ok: true, value: 0.1 });
    assert.deepEqual(numeralAsFloat("1e999", "float", false), { ok: true, value: Infinity });
    assert.deepEqual(numeralAsFloat("1e999", "float", true), { ok: true, value: -Infinity });
    const tiny = numeralAsFloat("1e-999", "float", false);
    assert.equal(tiny.ok && tiny.value, 0);
    assert.equal(underflowedToZero("1e-999", 0), true);
    assert.equal(underflowedToZero("0.0", 0), false);
  });

  test("preserves the sign of a negated zero", () => {
    const result = numeralAsFloat("0.0", "float", true);
    assert.equal(result.ok && Object.is(result.value, -0), true);
  });
});

describe("source spans", () => {
  const text = "fn f() -> Int {\n    1 + 1\n}\n";
  const file = new SourceFile("t.ko", text);

  test("maps byte offsets to one-based positions", () => {
    assert.deepEqual(file.positionOf(0), { line: 1, column: 1 });
    assert.deepEqual(file.positionOf(text.indexOf("+")), { line: 2, column: 7 });
    assert.deepEqual(file.positionOf(file.byteLength), { line: 4, column: 1 });
  });

  test("counts columns in scalar values and offsets in UTF-8 bytes", () => {
    // "u-umlaut" is two UTF-8 bytes and the globe is four, but each is one
    // column, and each is one scalar value.
    const unicode = new SourceFile("u.ko", 'x = "ü🌍" + y\n');
    const plusIndex = unicode.text.indexOf("+");
    assert.deepEqual(unicode.positionOf(unicode.byteOffsetOf(plusIndex)), { line: 1, column: 10 });
    // 11 ASCII characters, plus 2 bytes and 4 bytes for the two scalars.
    assert.equal(unicode.byteLength, 11 + 2 + 4);
  });

  test("resolves the last line without looping", () => {
    const many = new SourceFile("m.ko", "a\nb\nc\nd\ne\n");
    assert.equal(many.lineIndexOf(many.text.length), 5);
    assert.deepEqual(many.positionOf(many.byteLength), { line: 6, column: 1 });
  });
});
