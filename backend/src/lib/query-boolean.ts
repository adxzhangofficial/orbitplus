import { z } from "zod";

/**
 * Query strings are strings, so z.coerce.boolean() is unsafe here: both
 * "true" and "false" coerce to true in JavaScript. Accept only explicit,
 * unambiguous values and reject everything else with a validation error.
 */
export const explicitQueryBoolean = z.union([
  z.literal("true").transform(() => true),
  z.literal("false").transform(() => false),
  z.literal("1").transform(() => true),
  z.literal("0").transform(() => false),
  z.boolean(),
]);
