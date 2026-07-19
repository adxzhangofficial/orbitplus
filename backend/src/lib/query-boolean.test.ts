import { describe, expect, it } from "vitest";
import { explicitQueryBoolean } from "./query-boolean.js";

describe("explicitQueryBoolean", () => {
  it.each([
    ["true", true],
    ["1", true],
    [true, true],
    ["false", false],
    ["0", false],
    [false, false],
  ])("parses %j as %s", (input, expected) => {
    expect(explicitQueryBoolean.parse(input)).toBe(expected);
  });

  it.each(["yes", "no", "TRUE", "", 1, 0, null, undefined])("rejects ambiguous input %j", (input) => {
    expect(explicitQueryBoolean.safeParse(input).success).toBe(false);
  });
});
