import { z } from "zod";

/**
 * Validation schemas for Customer query parameters.
 * Governance: PRD §6.6, validation-and-error-mapping/SKILL.md.
 */

export const customerQuerySchema = z.object({
  city: z.string().optional(),
});
