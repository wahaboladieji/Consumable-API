import { z } from "zod";

/**
 * Validation schemas for Menu Item query parameters.
 * Governance: PRD §6.6, validation-and-error-mapping/SKILL.md.
 */

export const menuItemQuerySchema = z.object({
  category: z.string().optional(),
  restaurantId: z.string().uuid().optional(),
  isAvailable: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  minPrice: z
    .string()
    .refine((val) => !isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0, {
      message: "minPrice must be a non-negative integer in kobo",
    })
    .transform((val) => parseInt(val, 10))
    .optional(),
  maxPrice: z
    .string()
    .refine((val) => !isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0, {
      message: "maxPrice must be a non-negative integer in kobo",
    })
    .transform((val) => parseInt(val, 10))
    .optional(),
});
