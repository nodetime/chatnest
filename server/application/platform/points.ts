import { z } from "zod";

/**
 * Points are transported as decimal strings with six fractional digits at
 * most. The fixed scale is part of Platform Points v1, so every client-side
 * parser must reject floating-point or over-precision values at the boundary.
 */
export const pointStringSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,18})(?:\.\d{1,6})?$/,
    "fixed-point points string required"
  );
