import { z } from "zod";

/**
 * Validation schemas for Restaurant query parameters and resources.
 * Governance: PRD §6.6, validation-and-error-mapping/SKILL.md.
 */

export const restaurantQuerySchema = z.object({
  city: z.string().optional(),
  cuisine: z.string().optional(),
  isOpen: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  minRating: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 1.0 && parseFloat(val) <= 5.0, {
      message: "minRating must be a number between 1.0 and 5.0",
    })
    .transform((val) => parseFloat(val))
    .optional(),
  maxDeliveryFee: z
    .string()
    .refine((val) => !isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0, {
      message: "maxDeliveryFee must be a non-negative integer in kobo",
    })
    .transform((val) => parseInt(val, 10))
    .optional(),
});
